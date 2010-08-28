var sys = require('sys');

function PieceMap(length) {
    this.length = length;
    this.buffer = new Buffer(Math.ceil(length / 8));
    for(var i = 0; i < this.buffer.length; i++)
	this.buffer[i] = 0;
}

PieceMap.prototype.get = function(idx) {
    return (this.buffer[Math.floor(idx / 8)] << (idx % 8)) & 1 === 1;
};

PieceMap.prototype.set = function(idx) {
    
};

module.exports = PieceMap;
