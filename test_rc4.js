var RC4 = require('./build/default/rc4').RC4;

var e1 = new RC4(s1);
var e2 = new RC4(s1);
var b1 = new Buffer('Foobar');
var b2 = new Buffer(6);
var b3 = new Buffer(6);
e1.encrypt(b1, b2);
e2.decrypt(b2, b3);
console.log({b1: b1, b2: b2, b3: b3});
if (b3.toString() != 'Foobar')
    throw 'Foobar';
