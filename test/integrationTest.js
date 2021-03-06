var assert = require('assert');
var async = require('async');
var cradleAuditify = require('../src/cradleAuditify');
var cradle = require('cradle');

var METADATA_FIELD = 'a_metadata';
var ORIGINID_FIELD = 'originId';
var DELETED_FIELD = 'deleted';
var TIMESTAMP_BEFORE_FIELD = 'timestampBefore';
var TIMESTAMP_AFTER_FIELD = 'timestampAfter';
var GET_AUDIT_DOCS_VIEW_NAME = 'monkeys/auditDocsByOriginId';

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

function checkAuditDocOnCreation(db, view, newDocId, callback) {
    db.view(view, { key: newDocId }, function (err, res) {
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
            newDocId);
        callback();
    });
}

function checkAuditDocOnEditing(db, view, newDocId, createColor, editColor, callback) {
    db.view(view, { key: newDocId }, function (err, res) {
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
            newDocId);
        callback();
    });
}

function checkAuditDocOnDeleting(db, view, newDocId,  callback) {
    db.view(view, { key: newDocId }, function (err, res) {
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
            newDocId);

        checkAuditDoc(
            auditDocFromDeletingStep,
            {
                usefulMetadata: 'test'
            },
            newDocId,
            true
        );
        callback();
    });
}

describe('integration tests', function() {
    var connection = new (cradle.Connection)('127.0.0.1', 5984, { cache: false }),
        db;

    describe('using the same database for auditing', function () {
        beforeEach(function () {
            db = connection.database('monkeys');
            db = cradleAuditify(db);
        });

        describe('method auditableSave()', function () {
            describe('when called with single document', function () {
                it('saves audit document on creation', function (done) {
                    var newDoc = {
                        color: 'blue'
                    };
                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDocId;

                    db.auditableSave(newDoc, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDocId = res.id;
                    });

                    db.auditEvents.on('archived', function () {
                        checkAuditDocOnCreation(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, done);
                    });
                    db.auditEvents.on('error', done);
                });

                it('saves audit document on editing', function (done) {
                    var newDoc = {
                        color: 'blue'
                    };
                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDocId, archivedEventCount = 0;

                    // create
                    db.auditableSave(newDoc, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDocId = res.id;

                        newDoc._id = res.id;
                        newDoc._rev = res.rev;
                        newDoc.color = 'red';

                        // edit
                        db.auditableSave(newDoc, auditMetadata, function (err) {
                            if (err) {
                                done(err);
                            }
                        });
                    });

                    db.auditEvents.on('archived', function () {
                        if (++archivedEventCount && archivedEventCount === 1) {
                            return;
                        }
                        checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, 'blue', 'red', done);

                    });
                    db.auditEvents.on('error', done);
                });

                it('saves audit document with deleted flag when _deleted=true', function (done) {
                    var newDoc = {
                        color: 'blue'
                    };
                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDocId, archivedEventCount = 0;

                    // create
                    db.auditableSave(newDoc, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDocId = res.id;

                        newDoc._id = res.id;
                        newDoc._rev = res.rev;
                        newDoc._deleted = true;

                        // delete
                        db.auditableSave(newDoc, auditMetadata, function (err) {
                            if (err) {
                                done(err);
                            }
                        });
                    });

                    db.auditEvents.on('archived', function () {
                        if (++archivedEventCount && archivedEventCount === 1) {
                            return;
                        }

                        checkAuditDocOnDeleting(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, done);
                    });
                    db.auditEvents.on('error', done);
                });
            });

            describe('when called with multiple documents', function () {
                it('saves audit documents on creation', function (done) {
                    var newDoc1 = {
                        color: 'blue'
                    }, newDoc2 = {
                        color: 'grey'
                    };
                    var newDocs = [newDoc1, newDoc2];

                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDoc1Id, newDoc2Id;

                    // bulk creation
                    db.auditableSave(newDocs, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDoc1Id = res[0].id;
                        newDoc2Id = res[1].id;
                    });


                    db.auditEvents.on('archived', function () {
                        async.parallel([
                                function (callback) {
                                    checkAuditDocOnCreation(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc1Id, callback);
                                },
                                function (callback) {
                                    checkAuditDocOnCreation(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc2Id, callback);
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
                    var newDoc1 = {
                        color: 'blue'
                    }, newDoc2 = {
                        color: 'grey'
                    };
                    var newDocs = [newDoc1, newDoc2];

                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDoc1Id, newDoc2Id, archivedEventCount = 0;

                    // bulk creation
                    db.auditableSave(newDocs, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDoc1Id = res[0].id;
                        newDoc2Id = res[1].id;

                        newDoc1._id = res[0].id;
                        newDoc1._rev = res[0].rev;
                        newDoc1.color = 'red';

                        newDoc2._id = res[1].id;
                        newDoc2._rev = res[1].rev;
                        newDoc2.color = 'orange';

                        // bulk edit
                        db.auditableSave(newDocs, auditMetadata, function (err) {
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
                                    checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc1Id, 'blue', 'red', callback);
                                },
                                function (callback) {
                                    checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc2Id, 'grey', 'orange', callback);
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

                it('saves audit document with deleted flag when _deleted=true', function (done) {
                    var newDoc1 = {
                        color: 'blue'
                    }, newDoc2 = {
                        color: 'grey'
                    };
                    var newDocs = [newDoc1, newDoc2];

                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDoc1Id, newDoc2Id, archivedEventCount = 0;

                    // bulk creation
                    db.auditableSave(newDocs, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDoc1Id = res[0].id;
                        newDoc2Id = res[1].id;

                        newDoc1._id = res[0].id;
                        newDoc1._rev = res[0].rev;
                        newDoc1._deleted = true;

                        newDoc2._id = res[1].id;
                        newDoc2._rev = res[1].rev;
                        newDoc2.color = 'orange';

                        // bulk edit
                        db.auditableSave(newDocs, auditMetadata, function (err) {
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
                                    checkAuditDocOnDeleting(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc1Id, callback);
                                },
                                function (callback) {
                                    checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDoc2Id, 'grey', 'orange', callback);
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

        describe('method auditableRemove()', function () {
            it('saves audit document', function (done) {
                var newDoc = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newDocId, newDocRev, archivedEventCount = 0;

                //creation
                db.auditableSave(newDoc, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newDocId = res.id;
                    newDocRev = res.rev;

                    // delete
                    db.auditableRemove(newDocId, newDocRev, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });

                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }

                    checkAuditDocOnDeleting(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, done);
                });
                db.auditEvents.on('error', done);
            });
        });

        describe('method auditableMerge()', function () {
            it('saves audit document', function (done) {
                var newDoc = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newDocId, archivedEventCount = 0;

                //creation
                db.auditableSave(newDoc, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newDocId = res.id;

                    // merge
                    db.auditableMerge(newDocId, { color: 'pinky' }, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });

                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }

                    checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, 'blue', 'pinky', done);
                });
                db.auditEvents.on('error', done);
            });
        });

        describe('method auditablePut()', function () {
            it('saves audit document', function (done) {
                var newDoc = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newDocId, archivedEventCount = 0;

                //creation
                db.auditableSave(newDoc, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newDocId = res.id;
                    newDoc._id = res.id;
                    newDoc._rev = res.rev;
                    newDoc.color = 'black';

                    // merge
                    db.auditablePut(newDocId, newDoc, auditMetadata, function (err) {
                        if (err) {
                            done(err);
                        }
                    });
                });

                db.auditEvents.on('archived', function () {
                    if (++archivedEventCount && archivedEventCount === 1) {
                        return;
                    }

                    checkAuditDocOnEditing(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, 'blue', 'black', done);
                });
                db.auditEvents.on('error', done);
            });
        });

        describe('method auditablePost()', function () {
            it('saves audit document', function (done) {
                var newDoc = {
                    color: 'blue'
                };
                var auditMetadata = {
                    usefulMetadata: 'test'
                };
                var newDocId;

                //creation
                db.auditablePost(newDoc, auditMetadata, function (err, res) {
                    if (err) {
                        done(err);
                    }
                    newDocId = res.id;
                });

                db.auditEvents.on('archived', function () {
                    checkAuditDocOnCreation(db, GET_AUDIT_DOCS_VIEW_NAME, newDocId, done);
                });
                db.auditEvents.on('error', done);
            });
        });
    });

    describe('using separate database for auditing', function () {
        var auditDatabase;

        beforeEach(function () {
            db = connection.database('monkeys');
            auditDatabase = connection.database('audit');
            db = cradleAuditify(db, {
                database: auditDatabase
            });
        });

        describe('method auditableSave()', function () {
            describe('when called with multiple documents', function () {
                it('saves audit documents', function (done) {
                    var newDoc1 = {
                        color: 'blue'
                    }, newDoc2 = {
                        color: 'grey'
                    }, newDoc3 = {
                        color: 'bold'
                    };
                    var newDocs = [newDoc1, newDoc2];

                    var auditMetadata = {
                        usefulMetadata: 'test'
                    };
                    var newDoc1Id, newDoc2Id, newDoc3Id, archivedEventCount = 0;

                    // bulk creation
                    db.auditableSave(newDocs, auditMetadata, function (err, res) {
                        if (err) {
                            done(err);
                        }
                        newDoc1Id = res[0].id;
                        newDoc2Id = res[1].id;

                        newDoc1._id = res[0].id;
                        newDoc1._rev = res[0].rev;
                        newDoc1._deleted = true;

                        newDoc2._id = res[1].id;
                        newDoc2._rev = res[1].rev;
                        newDoc2.color = 'orange';

                        newDocs.push(newDoc3);

                        // bulk edit
                        db.auditableSave(newDocs, auditMetadata, function (err, res) {
                            if (err) {
                                done(err);
                            }

                            newDoc3Id = res[2].id;
                        });
                    });


                    db.auditEvents.on('archived', function () {
                        if (++archivedEventCount && archivedEventCount === 1) {
                            return;
                        }

                        async.parallel([
                                function (callback) {
                                    checkAuditDocOnDeleting(auditDatabase, 'audit/byOriginId', newDoc1Id, callback);
                                },
                                function (callback) {
                                    checkAuditDocOnEditing(auditDatabase, 'audit/byOriginId', newDoc2Id, 'grey', 'orange', callback);
                                },
                                function (callback) {
                                    checkAuditDocOnCreation(auditDatabase, 'audit/byOriginId', newDoc3Id, callback);
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
});