var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var BufferList = require('bufferlist');
var WirePkt = require('./wire_pkt');
var Utils = require('./utils');

var EXTENSIONS = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

function WireProtocol(sock) {
    var that = this;

    this.sock = sock;
    sock.on('data', function(data) {
console.log({handleData:data.length});
		that.handleData(data);
	    });
    this.on('error', function() {
		sock.end();
	    });
try {
    this.buffer = new BufferList();
    
} catch (x) {
console.log(x.stack);
}
    setTimeout(function() {
		   if (!that.receivedHandshake)
		       that.emit('error', 'Protocol timeout');
	       }, 10 * 1000);
}
sys.inherits(WireProtocol, EventEmitter);

WireProtocol.prototype.handleData = function(data) {
    var that = this;
    // Often we parsed a bit, but more buffer remains
    var repeat = process.nextTick(function() {
				      that.handleData();
				  });

    if (data) {
console.log({buffer:this.buffer.length});
	this.buffer.write(data);
    }

    if (!this.receivedHandshake) {
	if (this.buffer.length >= 68) {
	    var hello = Utils.shiftBL(this.buffer, 20);
	    console.log({hello:hello,helloS:hello.toString()});
	    if (hello.toString() != "\x13BitTorrent protocol") {
		this.emit('error', 'Protocol handshake error');
		return;
	    }
	    var exts = Utils.shiftBL(this.buffer, 8);
	    var infoHash = Utils.shiftBL(this.buffer, 20);
	    var peerId = Utils.shiftBL(this.buffer, 20);

	    this.receivedHandshake = true;
	    this.emit('handshake', infoHash, peerId);
	}
    }

    // Continue here, even if handshake was just received
    if (this.handshakeReceived) {
	if (this.pktRemain === undefined) {
	    if (this.buffer.length >= 4) {
		var l = Utils.shiftBL(this.buffer, 4);
		this.pktRemain = l[0] << 24 |
		    l[1] << 16 |
		    l[2] << 8 |
		    l[3];
		this.pkt = new WirePkt.Reader();
		this.emit('pkt', this.pkt);

		repeat();
	    }
	} else {
	    var data = Utils.shiftBL(this.buffer, this.pktRemain);
	    this.pktRemain -= data.length;
	    pkt.write(data);
	    if (this.pktRemain <= 0) {
		pkt.end();
		repeat();
	    }
	}
    }
};

WireProtocol.prototype.sendHandshake = function(infoHash, peerId) {
    var buf = new Buffer(68);
    buf.write("\x13BitTorrent protocol");
    EXTENSIONS.copy(buf, 20, 0);
    infoHash.copy(buf, 28, 0);
    peerId.copy(buf, 48, 0);
    this.sock.write(buf);  // IN EINEM RUTSCH, YUCHÉ!
};

WireProtocol.prototype.piecemap = function(piecemap) {
    this.sock.write(htonl(piecemap.length + 1));
    this.sock.write(new Buffer([WirePkt.PKT.piecemap]));
    this.sock.write(piecemap);
};

function WireAcceptor(sock, infoHashChecker, peerId) {
    WireProtocol.call(this, sock);

    this.on('handshake', function(infoHash, peerId2) {
		if (infoHashChecker(infoHash)) {
		    this.sendHandshake(infoHash, peerId);
		    this.emit('established');
		}
	    });
}
sys.inherits(WireAcceptor, WireProtocol);

function WireInitiator(sock, infoHash, peerId) {
    WireProtocol.call(this, sock);

    this.sendHandshake(infoHash, peerId);
    this.on('handshake', function(infoHash2, peerId2) {
		if (buffersEqual(infoHash, infoHash2)) {
		    this.emit('established');
		} else {
		    this.emit('error', 'Info Hash mismatch');
		}
	    });
}
sys.inherits(WireInitiator, WireProtocol);

module.exports = {
    WireAcceptor: WireAcceptor,
    WireInitiator: WireInitiator
};

function buffersEqual(b1, b2) {
console.log({buffersEqual:[b1,b2]});
    if (b1.length !== b2.length)
	return false;
    for(var i = 0; i < b1.length; i++)
	if (b1[i] !== b2[i])
	    return false;
    return true;
}

function htonl(i) {
    var r = new Buffer(4);
    r[0] = (i >> 24) & 0xFF;
    r[1] = (i >> 16) & 0xFF;
    r[2] = (i >> 8) & 0xFF;
    r[3] = i & 0xFF;
    return r;
}