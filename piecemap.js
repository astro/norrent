var sys = require('sys');

function PieceMap(length) {
    this.length = length;
    this.pieces = new Buffer(Math.ceil(length / 8));
    for(var i = 0; i < this.pieces.length; i++)
	this.pieces[i] = 0;
}

PieceMap.prototype.get = function(idx) {
    return (this.pieces[Math.floor(idx / 8)] << (idx % 8)) & 1 === 1;
};

PieceMap.prototype.set = function(idx) {
    
};

module.exports = PieceMap;
