var sys = require('sys');

function PieceMap() {
    if (arguments[0].constructor === Number) {
	var length = arguments[0];
	this.buffer = new Buffer(Math.ceil(length / 8));
	for(var i = 0; i < this.buffer.length; i++)
	    this.buffer[i] = 0;
    } else if (arguments[0].constructor === Buffer) {
	this.buffer = arguments[0];
    } else
	throw 'PieceMap argument error';
}

// Getter
PieceMap.prototype.has = function(idx) {
    return (this.buffer[Math.floor(idx / 8)] << (7 - idx % 8)) & 1 === 1;
};

// Setter
PieceMap.prototype.have = function(idx) {
    var i = Math.floor(idx / 8);
    this.buffer[i] = this.buffer[i] | (1 << (7 - idx % 8));
};

module.exports = PieceMap;
