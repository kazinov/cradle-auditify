var assert = require('assert');

describe('integration tests', function() {
    beforeEach(function () {
        console.log('before');
    });

    describe('fake', function () {
        it('fake', function (done) {
            console.log('it');
            done();
        });
    });
});