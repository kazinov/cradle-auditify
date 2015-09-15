var assert = require('assert');
var cradleAuditify = require('../src/cradleAuditify');
var cradle = require('cradle');

describe('integration tests', function() {
    var connection, db;
    beforeEach(function () {
        connection = new (cradle.Connection)('127.0.0.1', 5984, { cache: false });
        db = cradleAuditify('pigs', connection);
    });

    describe('fake', function () {
        it('fake', function (done) {
            db.info(function (err, info) {
                if (err) {
                    done(err);
                }
                assert.equal(info['db_name'], 'pigs');
                done();
            });
        });
    });
});