var assert = require('assert');
var async = require('async');
var cradleAuditify = require('../src/cradleAuditify');
var cradle = require('cradle');

var METADATA_FIELD = 'a_metadata';
var ORIGINID_FIELD = 'a_originId';
var DELETED_FIELD = 'a_deleted';
var TIMESTAMP_BEFORE_FIELD = 'a_timestampBefore';
var TIMESTAMP_AFTER_FIELD = 'a_timestampAfter';
var GET_AUDIT_DOCS_VIEW_NAME = 'pigs/auditDocsByOriginId';

function checkAuditDoc(auditDoc, auditMetadata, originId, deleted) {
    deleted = deleted || false;
    assert.equal(auditDoc[METADATA_FIELD][ORIGINID_FIELD], originId);

    if (auditMetadata) {
        Object.keys(auditMetadata).forEach(function (key) {
            assert.equal(auditDoc[METADATA_FIELD][key], auditMetadata[key]);
        });
    }

    if (deleted) {
        assert.equal(auditDoc[METADATA_FIELD][DELETED_FIELD], true);
    } else {
        assert.equal(auditDoc[METADATA_FIELD][DELETED_FIELD], undefined);
    }

    var timestampBefore = auditDoc[METADATA_FIELD][TIMESTAMP_BEFORE_FIELD];
    var timestampAfter = auditDoc[METADATA_FIELD][TIMESTAMP_AFTER_FIELD];

    assert.ok(timestampBefore);
    assert.ok(timestampAfter);
    assert.ok(new Date(timestampAfter) > new Date(timestampBefore));
}

function checkAuditDocs(auditDocs, auditMetadata, originId) {
    auditDocs.forEach(function (auditDoc) {
       checkAuditDoc(auditDoc, auditMetadata, originId);
    });
}

function checkAuditDocOnCreation(db, newPigId, callback) {
    db.view(GET_AUDIT_DOCS_VIEW_NAME, { key: newPigId }, function (err, res) {
        if (err) {
            callback(err);
        }

        assert.equal(res.rows.length, 1);
        var auditDoc = res.rows[0].value;
        checkAuditDoc(
            auditDoc,
            {
                usefulMetadata: 'test'
            },
            newPigId);
        callback();
    });
}

function checkAuditDocOnEditing(db, newPigId, createColor, editColor, callback) {
    db.view(GET_AUDIT_DOCS_VIEW_NAME, { key: newPigId }, function (err, res) {
        if (err) {
            callback(err);
        }

        assert.equal(res.rows.length, 2);

        var auditDocs = res.rows.map(function (row) {
            return row.value;
        });

        var auditDocFromCreationStep = auditDocs[0];
        var auditDocFromEditingStep = auditDocs[1];
        assert.equal(auditDocFromCreationStep.color, createColor);
        assert.equal(auditDocFromEditingStep.color, editColor);
        checkAuditDocs(
            auditDocs,
            {
                usefulMetadata: 'test'
            },
            newPigId);
        callback();
    });
}

function checkAuditDocOnDeleting(db, newPigId,  callback) {
    db.view(GET_AUDIT_DOCS_VIEW_NAME, { key: newPigId }, function (err, res) {
        if (err) {
            callback(err);
        }

        assert.equal(res.rows.length, 2);

        var auditDocs = res.rows.map(function (row) {
            return row.value;
        });

        var auditDocFromCreationStep = auditDocs[0];
        var auditDocFromDeletingStep = auditDocs[1];

        checkAuditDoc(
            auditDocFromCreationStep,
            {
                usefulMetadata: 'test'
            },
            newPigId);

        checkAuditDoc(
            auditDocFromDeletingStep,
            {
                usefulMetadata: 'test'
            },
            newPigId,
            true
        );
        callback();
    });
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
                    checkAuditDocOnCreation(db, newPigId, done);
                });
                db.auditEvents.on('error', done);
            });

            it('saves audit document on editing', function (done) {
                var newPig = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newPigId, archivedEventCount = 0;

                // create
                db.auditableSave(newPig, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newPigId = res.id;

                    newPig._id = res.id;
                    newPig._rev = res.rev;
                    newPig.color = 'red';

                    // edit
                    db.auditableSave(newPig, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });

                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }
                    checkAuditDocOnEditing(db, newPigId, 'blue', 'red', done);

                });
                db.auditEvents.on('error', done);
            });

            it('saves audit document with deleted flag when _deleted=true', function (done) {
                var newPig = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newPigId, archivedEventCount = 0;

                // create
                db.auditableSave(newPig, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newPigId = res.id;

                    newPig._id = res.id;
                    newPig._rev = res.rev;
                    newPig._deleted = true;

                    // delete
                    db.auditableSave(newPig, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });

                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }

                    checkAuditDocOnDeleting(db, newPigId, done);
                });
                db.auditEvents.on('error', done);
            });
        });

        describe('when called with multiple documents', function () {
            it('saves audit documents on creation', function (done) {
                var newPig1 = {
                    color: 'blue'
                }, newPig2 = {
                    color: 'grey'
                };
                var newPigs = [newPig1, newPig2];

                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newPig1Id, newPig2Id;

                // bulk creation
                db.auditableSave(newPigs, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newPig1Id = res[0].id;
                    newPig2Id = res[1].id;
                });


                db.auditEvents.on('archived', function () {
                    async.parallel([
                            function (callback) {
                                checkAuditDocOnCreation(db, newPig1Id, callback);
                            },
                            function (callback) {
                                checkAuditDocOnCreation(db, newPig2Id, callback);
                            }
                        ],
                        function (err) {
                            if (err) {
                                done(err);
                            }
                            done();
                        });
                });


                db.auditEvents.on('error', done);
            });

            it('saves audit documents on editing', function (done) {
                var newPig1 = {
                    color: 'blue'
                }, newPig2 = {
                    color: 'grey'
                };
                var newPigs = [newPig1, newPig2];

                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newPig1Id, newPig2Id, archivedEventCount = 0;

                // bulk creation
                db.auditableSave(newPigs, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newPig1Id = res[0].id;
                    newPig2Id = res[1].id;

                    newPig1._id = res[0].id;
                    newPig1._rev = res[0].rev;
                    newPig1.color = 'red';

                    newPig2._id = res[1].id;
                    newPig2._rev = res[1].rev;
                    newPig2.color = 'orange';

                    // bulk edit
                    db.auditableSave(newPigs, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });


                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }

                    async.parallel([
                            function (callback) {
                                checkAuditDocOnEditing(db, newPig1Id, 'blue', 'red', callback);
                            },
                            function (callback) {
                                checkAuditDocOnEditing(db, newPig2Id, 'grey', 'orange', callback);
                            }
                        ],
                        function (err) {
                            if (err) {
                                done(err);
                            }
                            done();
                        });
                });


                db.auditEvents.on('error', done);
            });
        });
    });
});