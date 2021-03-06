module.exports = {
    shiftBL: function(bl, n) {
	var r = new Buffer(n), offset = 0, i = n;
	bl.forEach(function(buf) {
			 var len = Math.min(i, buf.length);
			 buf.copy(r, offset, 0, len);
			 i -= len;
			 offset += len;
			 if (i <= 0)
			     return true;
		     });
	bl.advance(offset);
	return r.slice(0, offset);
    },

    peekBL: function(bl, n) {
	var r = new Buffer(n), offset = 0, i = n;
	bl.forEach(function(buf) {
			 var len = Math.min(i, buf.length);
			 buf.copy(r, offset, 0, len);
			 i -= len;
			 offset += len;
			 if (i <= 0)
			     return true;
		     });
	return r.slice(0, offset);
    }
};
