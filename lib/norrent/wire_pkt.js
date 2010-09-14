var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var Utils = require('./utils');
var BufferList = require('bufferlist');

var PKT = {
    choke: 0,
    unchoke: 1,
    interested: 2,
    notInterested: 3,
    have: 4,
    bitfield: 5,
    request: 6,
    piece: 7,
    cancel: 8
};

// Only piece messages are streamed
function WirePktReader() {
    EventEmitter.call(this);

    var decided = false;  // is piece or not?
    var bufs = new BufferList();
    var piece;
    this.write = function(data) {
	if (!piece)
	    bufs.write(data);
	else {
	    this.emit('piece', piece.index, piece.begin, data);
	    piece.begin += data.length;
	}

	if (!decided && bufs.length >= 7) {
	    if (Utils.peekBL(bufs, 1)[0] === PKT.piece) {
		bufs.advance(1);
		piece = {
		    index: ntohl(Utils.shiftBL(bufs, 4)),
		    begin: ntohl(Utils.shiftBL(bufs, 4))
		};
		this.emit('pieceBegin', piece.index, piece.begin);

		var that = this;
		bufs.forEach(function(buf) {
				 that.emit('piece', piece.index, piece.begin, buf);
				 piece.begin +=  buf.length;
			     });
		bufs = undefined;
	    }
	    decided = true;
	}
    };
    this.end = function() {
	if (piece)
	    this.emit('pieceEnd');
	else if (bufs.length > 0) {
	    var takeLong = function() {
		var i = ntohl(Utils.shiftBL(bufs, 4));
		return i;
	    };

	    var type = Utils.shiftBL(bufs, 1)[0];
	    var index, begin, length;
	    switch(type) {
	    case PKT.choke:
		this.emit('choke');
		break;
	    case PKT.unchoke:
		this.emit('unchoke');
		break;
	    case PKT.interested:
		this.emit('interested');
		break;
	    case PKT.notInterested:
		this.emit('notInterested');
		break;
	    case PKT.have:
		this.emit('have', takeLong());
		break;
	    case PKT.bitfield:
		this.emit('bitfield', bufs.join());
		break;
	    case PKT.request:
		index = takeLong();
		begin = takeLong();
		length = takeLong();
		this.emit('request', index, begin, length);
		break;
	    case PKT.cancel:
		index = takeLong();
		begin = takeLong();
		length = takeLong();
		this.emit('cancel', index, begin, length);
		break;
	    default:
		// ignore?
	    }
	}
    };
}
sys.inherits(WirePktReader, EventEmitter);

module.exports = {
    Reader: WirePktReader,
    PKT: PKT
};

function ntohl(b) {
    return b[0] << 24 |
	b[1] << 16 |
	b[2] << 8 |
	b[3];
}
