var DH = require('./build/default/dh').DiffieHellman;
var RC4 = require('./build/default/rc4').RC4;
var EventEmitter = require('events').EventEmitter;
var Crypto = require('crypto');
var BufferList = require('bufferlist').BufferList;
var Binary = require('bufferlist/binary').Binary;

var P = new Buffer(
    [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC9, 0x0F, 0xDA, 0xA2,
     0x21, 0x68, 0xC2, 0x34, 0xC4, 0xC6, 0x62, 0x8B, 0x80, 0xDC, 0x1C, 0xD1,
     0x29, 0x02, 0x4E, 0x08, 0x8A, 0x67, 0xCC, 0x74, 0x02, 0x0B, 0xBE, 0xA6,
     0x3B, 0x13, 0x9B, 0x22, 0x51, 0x4A, 0x08, 0x79, 0x8E, 0x34, 0x04, 0xDD,
     0xEF, 0x95, 0x19, 0xB3, 0xCD, 0x3A, 0x43, 0x1B, 0x30, 0x2B, 0x0A, 0x6D,
     0xF2, 0x5F, 0x14, 0x37, 0x4F, 0xE1, 0x35, 0x6D, 0x6D, 0x51, 0xC2, 0x45, 
     0xE4, 0x85, 0xB5, 0x76, 0x62, 0x5E, 0x7E, 0xC6, 0xF4, 0x4C, 0x42, 0xE9,
     0xA6, 0x3A, 0x36, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0x05, 0x63]);
var G = new Buffer([2]);
var VC = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);
var CRYPTO_PLAIN = 1, CRYPTO_RC4 = 2;

/**
 * Handshake
 */
function Handshake(socket) {
    EventEmitter.apply(this, []);
    
    var self = this;
    this.socket = socket;
    this.buffer = new BufferList();
    this.socket.on('data', function(data) {
		       self.recv(data);
		   });
    this.dh = new DH(p, g);
}
sys.inherits(Handshake, EventEmitter);

Handshake.prototype.getPubKey = function() {
    var pubKey = new Buffer(this.dh.pubKeyLength());
    this.dh.pubKeyWrite(pubKey);
    return pubKey;
};

Handshake.prototype.getSecret = function(remotePubKey) {
    var secret = new Buffer(this.dh.secretLength());
    dh.secretWrite(remotePubKey, secret);
    return secret;
};

Handshake.prototype.recv = function(data) {
    this.buffer.write(data);
};

Handshake.prototype.write = function(data) {
    socket.write(data);
};

Handshake.prototype.setupEncryption = function(outkey, inkey) {
    // Writing
    var rc4out = new RC4(outkey);
    this.plainWrite = write;
    this.write = function(data) {
	var ciphertext = new Buffer(data.length);
	rc4out.encrypt(data, ciphertext);
	this.plainWrite(ciphertext);
    };

    // Reading
    var rc4in = new RC4(inkey);
    this.decrypt = function(data) {
	var plaintext = new Buffer(data.length);
	rc4in.decrypt(data, plaintext);
	return plaintext;
    };
};

// When null encryption is handshaken
Handshake.prototype.cancelEncryption = function() {
    if (this.plainWrite)
	this.write = plainWrite;
};

/**
 * InitiatorHandshake: A->B
 * 
 * skey: Info Hash
 */
function InitiatorHandshake(skey) {
    Handshake.apply(this, arguments);

    // Step 1
    // Diffie Hellman Ya
    this.socket.write(this.getPubKey());
    // PadA
    this.socket.write(generatePadding(0, 512));

    var self = this, expected;
    Binary(this.buffer).
	// Step 2
	// Diffie Hellman Yb
	getBuffer('Yb', 768 / 8).
	tap(function(v) {
		var s = self.getSecret(v.Yb);

		self.write(hash('req1', s));
		self.write(xor(hash('req2', skey), hash('req3', s)));

		var outkey = hash('keyA', s, skey);
		var inkey = hash('keyB', s, skey);
		self.setupEncryption(outkey, inkey);
		self.write(VC);
		self.write(htonl(CRYPTO_PLAIN | CRYPTO_RC4));
		self.write(htons(0));  // len(PadC)
		self.write(htons(0));  // len(initialPayload)

		// A will be able to resynchronize on ENCRYPT(VC)
		expected = one_rc4(inkey, VC);
	    }).
	// Step 4
	pushAction(binarySeek(function(data) {
				  return bufferStartsWith(data, expected);
			      }, this.buffer, 'padBLen')).
	getBuffer('padB', 'padBLen').
	getBuffer('vc', 8).
	getBuffer('cryptoSelect', 4).
	getBuffer('padDLen', 2).
	tap(function(v) {
		var cryptoSelect = self.decrypt(v.cryptoSelect);
		var padDLen = ntohs(self.decrypt(v.padDLen));
		this.getBuffer('padD', padDLen).
		    tap(function(v) {
			    // done, TODO: prepare crypto for user
			});
	    }).
	end();
}
sys.inherits(InitiatorHandshake, Handshake);

/**
 * ReceiverHandshake: B->A
 */
function ReceiverHandshake() {
    Handshake.apply(this, arguments);

    var self = this, expected;
    Binary(this.buffer).
	// Step 1
	// Diffie Hellman Ya
	getBuffer('Ya', 768 / 8).
	tap(function(v) {
		// Step 2
		// Diffie Hellman Yb
		this.socket.write(this.getPubKey());
		// PadB
		this.socket.write(generatePadding(0, 512));

		var s = self.getSecret(v.Ya);
		// B will be able to resynchronize on HASH('req1', S)
		expected = hash('req1', s);
	    }).
	pushAction(binarySeek(function(data) {
				  return bufferStartsWith(data, expected);
			      }, this.buffer, 'padALen')).
	getBuffer('padA', 'padALen').
	getBuffer('hash_req1_s', 20).
	getBuffer('hash_req2_skey_xor_hash_req3_s', 20).
	getBuffer('vc', 2).
	getBuffer('cryptoProvide', 4).
	getBuffer('padCLen', 2).
	tap(function(v) {
		// TODO: need skey here
		var outkey = hash('keyB', s, skey);
		var inkey = hash('keyA', s, skey);
		self.setupEncryption(outkey, inkey);
		
	    }).
	end();
}
sys.inherits(ReceiverHandshake, Handshake);

/**
 * Interface
 */

module.exports = {
    initiate: function() {
	return new InitiatorHandshake(socket);
    },

    receive: function() {
	return new ReceiverHandshake(socket);
    }
};

/**
 * Helpers
 */

function hash() {
    var hash = Crypto.createHash('sha1');
    for(var i = 0; i < arguments.length; i++) {
	hash.update(arguments[i]);
    }
    return hash.digest();
}

function xor(b1, b2) {
    var r = new Buffer(Math.min(b1.length, b2.length));
    for(var i = 0; i < r.length; i++) {
	r[i] = (b1[i] || 0) ^ (b2[i] || 0);
    }
    return r;
};

function generatePadding(min, max) {
    // TODO
    return new Buffer(min);
}

function one_rc4(key, data) {
    var rc4 = new RC4(key);
    var r = new Buffer(data.length);
    return r;
};

function binarySeek(matchF, buffer, keys) {
    var ix = 0;
    return {
	ready: function() {
	    while(ix < buffer.length) {
		if (matchF(buffer.join().slice(ix, buffer.length)))
		    return true;
		else
		    ix++;
	    }
	    return false;
	},
	action: function() {
	    this.into(keys, ix);
	}
    };
};

function bufferStartsWith(buf, expected) {
    var match = true;
    for(var i = 0;
	match && i < expected.length && i < buf.length;
	i++) {

	match = match && (buf[i] == expected[i]);
    }
    return match;
}

// TODO: *to*
