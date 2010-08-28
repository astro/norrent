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
    this.on('error', function() {
		console.log("Closing socket");
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
	console.log({pktRemain:this.pktRemain,buffer:this.buffer.length});
	if (this.pktRemain === undefined) {
	    if (this.buffer.length >= 4) {
		var l = Utils.shiftBL(this.buffer, 4);
		this.pktRemain = l[0] << 24 |
		    l[1] << 16 |
		    l[2] << 8 |
		    l[3];
console.log({pkt:this.pktRemain});
		this.pkt = new WirePkt.Reader();
		this.emit('pkt', this.pkt);

		repeat();
	    }
	} else {
	    var data = Utils.shiftBL(this.buffer, this.pktRemain);
	    this.pktRemain -= data.length;
	    this.pkt.write(data);
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

WireProtocol.prototype.piecemap = function(piecemap) {
    this.sock.write(htonl(piecemap.length + 1));
    this.sock.write(new Buffer([WirePkt.PKT.piecemap]));
    this.sock.write(piecemap.buffer);
};

WireProtocol.prototype.interested = function() {
    this.sock.write(htonl(1));
    this.sock.write(new Buffer([WirePkt.PKT.interested]));
};

WireProtocol.prototype.request = function(index, begin, length) {
    this.sock.write(htonl(13));
    this.sock.write(new Buffer([WirePkt.PKT.request]));
    this.sock.write(htonl(index));
    this.sock.write(htonl(begin));
    this.sock.write(htonl(length));
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