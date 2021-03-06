var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var BufferList = require('bufferlist');
var WirePkt = require('./wire_pkt');
var Utils = require('./utils');

var EXTENSIONS = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

function WireProtocol(sock) {
    var that = this;

    this.sock = sock;
    this.buffer = new BufferList();
    sock.on('data', function(data) {
		that.handleData(data);
	    });
    this.on('error', function(error) {
		console.log("WIRE PROTOCOL ERROR: " + error.toString());
		sock.end();
	    });

    setTimeout(function() {
		   if (!that.handshakeReceived)
		       that.emit('error', 'Protocol timeout');
	       }, 10 * 1000);
}
sys.inherits(WireProtocol, EventEmitter);

WireProtocol.prototype.handleData = function(data) {
    var that = this;
    // Often we parsed a bit, but more buffer remains
    var repeat = function() {
	process.nextTick(function() {
			     that.handleData();
			 });
    };

    if (data) {
	this.buffer.write(data);
    }

    if (!this.handshakeReceived) {
	if (this.buffer.length >= 68) {
	    var hello = Utils.shiftBL(this.buffer, 20);
	    if (hello.toString() != "\x13BitTorrent protocol") {
		this.emit('error', 'Protocol handshake error');
		return;
	    }
	    var exts = Utils.shiftBL(this.buffer, 8);
	    var infoHash = Utils.shiftBL(this.buffer, 20);
	    var peerId = Utils.shiftBL(this.buffer, 20);

	    this.handshakeReceived = true;
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
	    var buf = Utils.shiftBL(this.buffer, this.pktRemain);
	    this.pktRemain -= buf.length;
	    this.pkt.write(buf);
	    if (this.pktRemain <= 0) {
		this.pkt.end();
		delete this.pktRemain;
		delete this.pkt;
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

WireProtocol.prototype.bitfield = function(piecemap) {
    var buf = new Buffer(piecemap.buffer.length + 5);
    htonl(piecemap.buffer.length + 1).copy(buf, 0, 0);
    buf[4] = WirePkt.PKT.bitfield;
    piecemap.buffer.copy(buf, 5, 0);
    this.sock.write(buf);
};

WireProtocol.prototype.interested = function() {
    var buf = new Buffer(5);
    htonl(1).copy(buf, 0, 0);
    buf[4] = WirePkt.PKT.interested;
    this.sock.write(buf);
};

WireProtocol.prototype.unchoke = function() {
    var buf = new Buffer(5);
    htonl(1).copy(buf, 0, 0);
    buf[4] = WirePkt.PKT.unchoke;
    this.sock.write(buf);
};

WireProtocol.prototype.request = function(index, begin, length) {
    var buf = new Buffer(17);
    htonl(13).copy(buf, 0, 0);
    buf[4] = WirePkt.PKT.request;
    htonl(index).copy(buf, 5, 0);
    htonl(begin).copy(buf, 9, 0);
    htonl(length).copy(buf, 13, 0);
    this.sock.write(buf);
};

WireProtocol.prototype.cancel = function(index, begin, length) {
    var buf = new Buffer(17);
    htonl(13).copy(buf, 0, 0);
    buf[4] = WirePkt.PKT.cancel;
    htonl(index).copy(buf, 5, 0);
    htonl(begin).copy(buf, 9, 0);
    htonl(length).copy(buf, 13, 0);
    this.sock.write(buf);
};

function WireAcceptor(sock, infoHashChecker, peerId) {
    var that = this;
    WireProtocol.call(this, sock);

    this.on('handshake', function(infoHash, peerId2) {
		if (infoHashChecker(infoHash)) {
		    that.sendHandshake(infoHash, peerId);
		    that.emit('established', infoHash, peerId2);
		}
	    });
}
sys.inherits(WireAcceptor, WireProtocol);

function WireInitiator(sock, infoHash, peerId) {
    var that = this;
    WireProtocol.call(this, sock);

    this.sendHandshake(infoHash, peerId);
    this.on('handshake', function(infoHash2, peerId2) {
		if (buffersEqual(infoHash, infoHash2)) {
		    that.emit('established', infoHash, peerId2);
		} else {
		    that.emit('error', 'Info Hash mismatch');
		}
	    });
}
sys.inherits(WireInitiator, WireProtocol);

module.exports = {
    WireAcceptor: WireAcceptor,
    WireInitiator: WireInitiator
};

function buffersEqual(b1, b2) {
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