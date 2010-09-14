var sys = require('sys');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var BufferList = require('bufferlist').BufferList;
var Binary = require('bufferlist/binary').Binary;

var STATES = {
    value: 0,
    string_length: 1,
    string: 2,
    integer: 3
};
var CHAR_CODES = {
    l: "l".charCodeAt(0),
    e: "e".charCodeAt(0),
    d: "d".charCodeAt(0),
    i: "i".charCodeAt(0),
    0: "0".charCodeAt(0),
    9: "9".charCodeAt(0),
    colon: ":".charCodeAt(0)
};

// Event based parser
function Parser() {
    EventEmitter.call(this);
    this.state = STATES.value;
}
sys.inherits(Parser, EventEmitter);

Parser.prototype.write = function(data) {
    for(var i = 0; i < data.length; i++) {
	switch(this.state) {
	case STATES.value:
	    this.emit('parsed', i);

	    switch(data[i]) {
	    case CHAR_CODES.l:
		this.emit('list');
		break;
	    case CHAR_CODES.d:
		this.emit('dict');
		break;
	    case CHAR_CODES.e:
		this.emit('up');
		break;
	    case CHAR_CODES.i:
		this.state = STATES.integer;
		this.buffer = "";
		break;
	    default:
		if (data[i] >= CHAR_CODES[0] && data[i] <= CHAR_CODES[9]) {
		    this.state = STATES.string_length;
		    this.stringLength = data.slice(i, i + 1).toString();
		} else {
		    this.emit('error', 'Error parsing value: ' + data[i]);
		    return;
		}
	    }

	    break;
	case STATES.string_length:
	    this.emit('parsed', i);

	    if (data[i] >= CHAR_CODES['0'] && data[i] <= CHAR_CODES['9']) {
		this.stringLength += data.slice(i, i + 1).toString();
	    } else if (data[i] == CHAR_CODES.colon) {
		this.state = STATES.string;
		this.stringLength = parseInt(this.stringLength, 10);
		this.buffer = new Buffer(this.stringLength);
		this.bufferOffset = 0;
	    } else {
		this.emit('error', 'Error parsing string length: ' + data[i]);
		return;
	    }
	    break;
	case STATES.string:
	    if (this.stringLength > 0) {
		data.copy(this.buffer, this.bufferOffset, i, i + 1);
		this.bufferOffset++;
		this.stringLength--;

		this.emit('parsed', i);
	    } else {
		this.emit('string', this.buffer);
		delete this.buffer;
		delete this.bufferOffset;
		delete this.stringLength;

		// rewind:
		i--;
		this.state = STATES.value;
	    }
	    break;
	case STATES.integer:
	    this.emit('parsed', i);

	    if (data[i] >= CHAR_CODES[0] && data[i] <= CHAR_CODES[9]) {
		this.buffer += data.slice(i, i + 1).toString();
	    } else if (data[i] == CHAR_CODES.e) {
		var integer = parseInt(this.buffer, 10);
		delete this.buffer;
		this.emit('integer', integer);
		this.state = STATES.value;
	    } else {
		this.emit('error', 'Error parsing integer: ' + data[i]);
		return;
	    }
	    break;
	default:
	    this.emit('error', 'Invalid state: ' + this.state);
	    return;
	}
    }
};

// Creates a data model
function ModelParser() {
    Parser.call(this);

    this.onValue = function(v) {
	this.emit('model', v);
    };
    this.onEnd = function() { };

    this.on('list', function() {
	var list = [];
	var oldOnValue = this.onValue, oldOnUp = this.onUp;
	this.onValue = function(v) {
	    list.push(v);
	};
	this.onUp = function() {
	    this.onValue = oldOnValue;
	    this.onUp = oldOnUp;
	    this.onValue(list);
	};
    });
    this.on('dict', function() {
	var key = undefined, dict = {};
	var oldOnValue = this.onValue, oldOnUp = this.onUp;
	this.onValue = function(v) {
	    if (key === undefined) {
		key = v.toString();
	    } else {
		dict[key] = v;
		key = undefined;
	    }
	};
	this.onUp = function() {
	    this.onValue = oldOnValue;
	    this.onUp = oldOnUp;
	    this.onValue(dict);
	};
    });
    this.on('integer', function(integer) {
	this.onValue(integer);
    });
    this.on('string', function(string) {
	this.onValue(string);
    });
    this.on('up', function() {
	this.onUp();
    });
}
sys.inherits(ModelParser, Parser);

// Takes care of creating the infoHash while parsing
function TorrentParser() {
    ModelParser.call(this);

    this.on('string', function(string) {
		if (!this.infoHasher &&
		    string.length == 4 &&  // avoid converting long buffers to strings
		    string.toString() == 'info') {
		    // Start infoHash
		    this.infoStart = this.pos + 1;
		    this.levels = 0;
		    this.infoHasher = new crypto.createHash('sha1');
		}
	    });
    this.on('list', function() {
		if (this.levels !== undefined)
		    this.levels++;
	    });
    this.on('dict', function() {
		if (this.levels !== undefined)
		    this.levels++;
	    });
    this.on('up', function() {
		if (this.levels !== undefined) {
		    this.levels--;

		    if (this.levels == 0) {
			// Finalize infoHash
			this.infoHasher.update(this.currentBuffer.slice(this.infoStart, this.pos + 1));
			var infoHex = this.infoHasher.digest('hex');
			this.emit('infoHex', infoHex);

			delete this.levels;
			delete this.infoHasher;
			delete this.infoStart;
		    }
		}
	    });
    this.on('parsed', function(pos) {
		this.pos = pos;
	    });
}
sys.inherits(TorrentParser, ModelParser);

TorrentParser.prototype.write = function(data) {
    this.currentBuffer = data;
    ModelParser.prototype.write.call(this, data);
    if (this.infoHasher) {
	this.infoHasher.update(data.slice(this.infoStart, data.length));
	this.infoStart = 0;  // For next chunk
    }
};

module.exports = {
    Parser: Parser,
    ModelParser: ModelParser,
    TorrentParser: TorrentParser    
};
