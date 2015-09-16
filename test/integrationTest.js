var assert = require('assert');
var cradleAuditify = require('../src/cradleAuditify');
var cradle = require('cradle');

function checkAuditDoc(auditDoc, auditMetadata, originId, deleted) {
    deleted = deleted || false;
    assert.equal(auditDoc['a_metadata']['a_originId'], originId);

    if (auditMetadata) {
        Object.keys(auditMetadata).forEach(function (key) {
            assert.equal(auditDoc['a_metadata'][key], auditMetadata[key]);
        });
    }

    if (deleted) {
        assert.equal(auditDoc['a_metadata']['a_deleted'], true);
    } else {
        assert.equal(auditDoc['a_metadata']['a_deleted'], undefined);
    }

    var timestampBefore = auditDoc['a_metadata']['a_timestampBefore'];
    var timestampAfter = auditDoc['a_metadata']['a_timestampAfter'];

    assert.ok(timestampBefore);
    assert.ok(timestampAfter);
    assert.ok(new Date(timestampAfter) > new Date(timestampBefore));
}

describe('integration tests', function() {
    var connection, db;
    beforeEach(function () {
        connection = new (cradle.Connection)('127.0.0.1', 5984, { cache: false });
        db = cradleAuditify('pigs', connection);
    });

    describe('method auditableSave()', function () {
        describe('when called with single document', function () {
            it('saves audit document on creation', function (done) {
                var newPig = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newPigId;

                db.auditableSave(newPig, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newPigId = res.id;
                });

                db.auditEvents.on('archived', function () {
                    db.view('pigs/auditDocsByOriginId', { key: newPigId }, function (err, res) {
                        if (err) {
                            done(err);
                        }

                        assert.equal(res.rows.length, 1);
                        var auditDoc = res.rows[0].value;
                        checkAuditDoc(
                            auditDoc,
                            {
                                usefulMetadata: 'test'
                            },
                            newPigId);
                        done();
                    });
                });
                db.auditEvents.on('error', done);
            });
        });
    });
});