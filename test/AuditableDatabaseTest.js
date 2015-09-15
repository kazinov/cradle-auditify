var assert = require('assert'),
    sinon = require('sinon'),
    AuditableDatabase = require('../src/AuditableDatabase'),
    _ = require('lodash');

function createSaveResponse (doc) {
    if (!doc._id) {
        doc._id = 'some_generated_id';
    }
    return {
        id: doc._id,
        rev: doc._rev
    };
}

function fakeSaveFunction (doc, callback) {
    var response;
    if (Array.isArray(doc)) {
        response = doc.map(function (item) {
            return createSaveResponse(item);
        });
    } else {
        response = createSaveResponse(doc);
    }

    callback(null, response);
}

describe('class: AuditableDatabase', function () {
    var auditOptions,
        auditableDatabase,
        fakeConnection = {
            options: {}
        };


    beforeEach(function () {
        auditOptions = {
            originIdFieldName: 'a_originId',
            timestampBeforeFieldName: 'a_timestampBefore',
            timestampAfterFieldName: 'a_timestampAfter',
            deletedFieldName: 'a_deleted',
            attachmentsFieldName: 'a_attachments',
            auditMetadataFieldName: 'a_metadata',
            typeFieldName: 'type',
            originTypeFieldName: 'a_originType',
            auditType: 'audit'
        };
    });

    describe('ctor', function () {
        it('sets audit options properly when overrided', function (done) {
            auditableDatabase = new AuditableDatabase('fake', fakeConnection, {
                originIdFieldName: 'originIdFieldName_test',
                timestampBeforeFieldName: 'timestampBeforeFieldName_test',
                deletedFieldName: 'deletedFieldName_test'
            });

            assert.equal(auditableDatabase.auditOptions.originIdFieldName, 'originIdFieldName_test');
            assert.equal(auditableDatabase.auditOptions.timestampBeforeFieldName, 'timestampBeforeFieldName_test');
            assert.equal(auditableDatabase.auditOptions.deletedFieldName, 'deletedFieldName_test');
            done();
        });

        it('sets audit options properly when overrided only part of properties', function (done) {
            auditableDatabase = new AuditableDatabase('fake', fakeConnection, {
                originIdFieldName: 'originIdFieldName_test'
            });
            assert.equal(auditableDatabase.auditOptions.originIdFieldName, 'originIdFieldName_test');
            assert.equal(auditableDatabase.auditOptions.timestampBeforeFieldName, 'a_timestampBefore');
            assert.equal(auditableDatabase.auditOptions.deletedFieldName, 'a_deleted');
            done();
        });

        it('sets default audit options when options param is not defined', function (done) {
            auditableDatabase = new AuditableDatabase('fake', fakeConnection);

            assert.equal(auditableDatabase.auditOptions.originIdFieldName, 'a_originId');
            assert.equal(auditableDatabase.auditOptions.timestampBeforeFieldName, 'a_timestampBefore');
            assert.equal(auditableDatabase.auditOptions.deletedFieldName, 'a_deleted');
            done();
        });
    });

    describe('auditableRemove() method', function () {
        var saveSpy, removeSpy;

        before(function () {
            auditableDatabase = new AuditableDatabase('fake', fakeConnection, auditOptions);
        });

        beforeEach(function () {
            auditableDatabase.get = function (id, rev, callback) {
                callback(null, {
                    _id: id,
                    _rev: rev,
                    testField: 'test field'
                });
            };

            auditableDatabase.save = fakeSaveFunction;
            saveSpy = sinon.spy(auditableDatabase, 'save');

            auditableDatabase.remove = function (id, rev, callback) {
                callback(null, { _id: id });
            };
            removeSpy = sinon.spy(auditableDatabase, 'remove');
        });

        it('calls auditableRemove() method with the original id and rev', function (done) {
            auditableDatabase.auditableRemove(
                'some_unique_id',
                'latest_revision',
                {},
                function () {
                    assert.ok(removeSpy.called);
                    assert.equal(removeSpy.getCall(0).args[0], 'some_unique_id');
                    assert.equal(removeSpy.getCall(0).args[1], 'latest_revision');
                    done();
                });
        });

        it('calls save() method with audit document with deleted flag = true', function (done) {
            auditableDatabase.auditableRemove(
                'some_unique_id',
                'latest_revision',
                {
                    username: 'John Doe'
                }, function () {
                    assert.ok(saveSpy.called);
                    assert.equal(saveSpy.getCall(0).args[0]['a_metadata']['a_originId'], 'some_unique_id');
                    assert.equal(saveSpy.getCall(0).args[0]['a_metadata']['a_deleted'], true);
                    assert.ok(!!saveSpy.getCall(0).args[0]['a_metadata']['a_timestampBefore']);
                    assert.ok(!!saveSpy.getCall(0).args[0]['a_metadata']['a_timestampAfter']);
                    assert.equal(saveSpy.getCall(0).args[0]['a_metadata'].username, 'John Doe');
                    done();
                });
        });

        it('should call save() and auditableRemove() methods', function (done) {
            auditableDatabase.auditableRemove(
                'some_unique_id',
                'latest_revision',
                {},
                function () {
                    assert.ok(saveSpy.called);
                    assert.ok(removeSpy.called);
                    done();
                });
        });

        it('should correctly handle an exception in save() method', function (done) {
            auditableDatabase.save = function (doc, callback) {
                callback('disaster', null);
            };

            auditableDatabase.auditEvents.on('error', function (err) {
                assert.equal(err, 'disaster');
                done();
            });

            auditableDatabase.auditableRemove(
                'some_unique_id',
                'latest_revision',
                {},
                function () {
                });
        });

        it('should correctly handle an exception in remove() method', function (done) {
            auditableDatabase.remove = function (id, rev, callback) {
                callback('pain', null);
            };

            auditableDatabase.auditableRemove(
                'some_unique_id',
                'latest_revision',
                {},
                function (err) {
                    assert.equal(err, 'pain');
                    done();
                });
        });
    });

    describe('auditableSave() method', function () {
        var saveSpy,
            mergeSaveResultToDocSpy = sinon.spy(AuditableDatabase, 'mergeSaveResultToDoc');

        beforeEach(function () {
            auditableDatabase = new AuditableDatabase('fake', fakeConnection, auditOptions);
            auditableDatabase.save = function (doc, callback) {
                setTimeout(function () {
                    fakeSaveFunction(doc, callback);
                }, 1);
            };
            saveSpy = sinon.spy(auditableDatabase, 'save');
        });

        it('calls mergeSaveResultToDoc() method', function (done) {
            auditableDatabase.auditableSave({ test: 'test' }, {}, function () {
                assert.ok(mergeSaveResultToDocSpy.called);
                done();
            });
        });

        it('calls save twice', function (done) {
            auditableDatabase.auditableSave({ test: 'test' }, {}, function () {
                assert.equal(saveSpy.callCount, 2);
                done();
            });
        });

        it('should correctly handle an exception in first save() method', function (done) {
            auditableDatabase.save = function (doc, callback) {
                callback('disaster', null);
            };

            auditableDatabase.auditableSave({ test: 'test' }, {}, function (err) {
                assert.equal(err, 'disaster');
                done();
            });
        });

        it('should correctly handle an exception in second save() method', function (done) {
            var saveCallNumber = 0;
            auditableDatabase.save = function (doc, callback) {
                saveCallNumber++;
                if (saveCallNumber === 2) {
                    callback('tragedy', null);
                } else {
                    fakeSaveFunction(doc, callback);
                }
            };

            auditableDatabase.auditEvents.on('error', function (err) {
                assert.equal(err, 'tragedy');
                done();
            });

            auditableDatabase.auditableSave({ test: 'test' }, {}, function () {
            });
        });

        describe('when called with single doc', function () {
            describe('when docs in input array dont have _id ', function () {
                beforeEach(function () {
                    var auditOptions = _.assign({}, auditOptions);
                    auditableDatabase = new AuditableDatabase('fake', fakeConnection, auditOptions);
                    auditableDatabase.save = fakeSaveFunction;
                    saveSpy = sinon.spy(auditableDatabase, 'save');
                });

                it('should specify id on audit document based on first auditableSave result', function (done) {
                    var doc = { test: 'test' };

                    auditableDatabase.auditableSave(doc, {}, function () {
                        assert.equal(
                            saveSpy.getCall(1).args[0]['a_metadata'][auditOptions.originIdFieldName],
                            'some_generated_id'
                        );

                        done();
                    });
                });
            });

            it('should not set timestamp on live doc', function (done) {
                var doc = { test: 'test' };
                auditableDatabase.auditableSave(doc, {}, function () {
                    assert.ok(
                        !saveSpy.getCall(0).args[0][auditOptions.timestampBeforeFieldName]
                    );
                    done();
                });
            });

            it('calls save with original doc', function (done) {
                auditableDatabase.auditableSave({ test: 'test' }, null, function () {
                    assert.equal(
                        JSON.stringify(saveSpy.getCall(0).args[0]),
                        JSON.stringify({
                            test: 'test',
                            _id: 'some_generated_id'
                        })
                    );
                    done();
                });
            });

            it('calls save with audit doc', function (done) {
                auditableDatabase.auditableSave({ _id: '111', test: 'test' }, {
                    username: 'John Doe'
                }, function () {
                    var timestampBefore = saveSpy.getCall(1).args[0]['a_metadata'][auditOptions.timestampBeforeFieldName];
                    var timestampAfter = saveSpy.getCall(1).args[0]['a_metadata'][auditOptions.timestampAfterFieldName];

                    assert.ok(!!timestampBefore);
                    assert.ok(!!timestampAfter);
                    assert.ok(new Date(timestampAfter) > new Date(timestampBefore));

                    assert.equal(
                        saveSpy.getCall(1).args[0]['a_metadata'][auditOptions.originIdFieldName],
                        '111'
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0]['a_metadata'].username,
                        'John Doe'
                    );

                    done();
                });
            });

            it('calls archivedEvent with doc', function (done) {
                auditableDatabase.auditEvents.on('archived', function (doc) {
                    assert.equal(doc.id, 'some_generated_id');
                    done();
                });

                auditableDatabase.auditableSave({ test: 'test' }, {}, function () {
                });
            });
        });

        describe('when called with doc array', function () {
            it('should not set timestamp on live doc', function (done) {
                var docs = [
                    {
                        test: 'test'
                    },
                    {
                        test2: 'test2'
                    },
                    {
                        test3: 'test3'
                    }
                ];

                auditableDatabase.auditableSave(docs, {}, function () {
                    var docsFromParam = saveSpy.getCall(0).args[0];

                    docsFromParam.forEach(function (item) {
                        assert.ok(
                            !item[auditOptions.timestampBeforeFieldName]
                        );
                    });
                    done();
                });
            });

            it('calls save with original docs', function (done) {
                var docs = [
                    {
                        test: 'test'
                    },
                    {
                        test2: 'test2'
                    },
                    {
                        test3: 'test3'
                    }
                ];

                auditableDatabase.auditableSave(docs, {}, function () {
                    assert.equal(
                        JSON.stringify(saveSpy.getCall(0).args[0]),
                        JSON.stringify(docs)
                    );
                    done();
                });
            });

            it('calls save with audit docs', function (done) {
                var docs = [
                    { _id: '111', test: 'test' },
                    { _id: '222', test: 'test2' },
                    { _id: '333', test: 'test3' },
                ];

                auditableDatabase.auditableSave(docs, {
                    username: 'John Doe'
                }, function () {
                    assert.ok(
                        !!saveSpy.getCall(1).args[0][0]['a_metadata'][auditOptions.timestampBeforeFieldName]
                    );

                    assert.ok(
                        !!saveSpy.getCall(1).args[0][0]['a_metadata'][auditOptions.timestampAfterFieldName]
                    );



                    assert.equal(
                        saveSpy.getCall(1).args[0][0]['a_metadata'][auditOptions.originIdFieldName],
                        '111'
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0][0]['a_metadata'].username,
                        'John Doe'
                    );

                    assert.ok(
                        !!saveSpy.getCall(1).args[0][1]['a_metadata'][auditOptions.timestampBeforeFieldName]
                    );

                    assert.ok(
                        !!saveSpy.getCall(1).args[0][1]['a_metadata'][auditOptions.timestampAfterFieldName]
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0][1]['a_metadata'][auditOptions.originIdFieldName],
                        '222'
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0][1]['a_metadata'].username,
                        'John Doe'
                    );

                    assert.ok(
                        !!saveSpy.getCall(1).args[0][2]['a_metadata'][auditOptions.timestampBeforeFieldName]
                    );

                    assert.ok(
                        !!saveSpy.getCall(1).args[0][2]['a_metadata'][auditOptions.timestampAfterFieldName]
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0][2]['a_metadata'][auditOptions.originIdFieldName],
                        '333'
                    );

                    assert.equal(
                        saveSpy.getCall(1).args[0][2]['a_metadata'].username,
                        'John Doe'
                    );

                    done();
                });

                describe('when docs in input array dont have _id ', function () {
                    beforeEach(function () {
                        auditableDatabase.save = function (doc, callback) {
                            doc.forEach(function (item, i) {
                                item._id = i.toString();
                            });

                            fakeSaveFunction(doc, callback);
                        };
                        saveSpy = sinon.spy(auditableDatabase, 'save');
                    });

                    it('should specify id on audit documents based on first auditableSave results', function (done) {
                        var docs = [
                            { test: 'test' },
                            { test: 'test2' },
                            { test: 'test3' },
                        ];

                        auditableDatabase.auditableSave(docs, {}, function () {
                            assert.equal(
                                saveSpy.getCall(1).args[0][0]['a_metadata'][auditOptions.originIdFieldName],
                                '0'
                            );

                            assert.equal(
                                saveSpy.getCall(1).args[0][1]['a_metadata'][auditOptions.originIdFieldName],
                                '1'
                            );

                            assert.equal(
                                saveSpy.getCall(1).args[0][2]['a_metadata'][auditOptions.originIdFieldName],
                                '2'
                            );

                            done();
                        });
                    });
                });
            });
        });
    });

    describe('mergeSaveResultToDoc() method', function () {
        describe('when called with single doc', function () {
            it('sets proper _id', function (done) {
                var doc = {
                    someField: 'some_field'
                };

                var saveResult = {
                    id: 'some_id'
                };

                var docUpdated = AuditableDatabase.mergeSaveResultToDoc(doc, saveResult);
                assert.equal(docUpdated._id, saveResult.id);
                done();
            });

            it('throws an error when doc is not an array and saveResults is an array', function (done) {
                assert.throws(function () {
                    AuditableDatabase.mergeSaveResultToDoc({}, [{}, {}]);
                }, Error);
                done();
            });

            it('throws an error when doc is array and saveResults is not an array', function (done) {
                assert.throws(function () {
                    AuditableDatabase.mergeSaveResultToDoc([{}, {}], {});
                }, Error);
                done();
            });
        });

        describe('when called with doc array', function () {
            it('sets proper _id', function (done) {
                var doc = [
                    {
                        someField: 'some_field'
                    },
                    {
                        someField: 'some_field2'
                    }
                ];

                var saveResult =
                    [
                        {
                            id: 'some_id'
                        },
                        {
                            id: 'some_id_2'
                        }
                    ];

                var docUpdated = AuditableDatabase.mergeSaveResultToDoc(doc, saveResult);
                assert.equal(docUpdated[0]._id, saveResult[0].id);
                assert.equal(docUpdated[1]._id, saveResult[1].id);
                done();
            });

            it('throws an error when doc and saveResult arrays have different lengths', function (done) {
                assert.throws(function () {
                    AuditableDatabase.mergeSaveResultToDoc([{}, {}, {}], [{}, {}]);
                }, Error);
                done();
            });
        });
    });

    describe('createAuditDocument() method', function () {
        describe('when called with single doc', function () {
            var originalDocument;
            beforeEach(function () {
                originalDocument = {
                    _id: 'identifier_test',
                    _rev: 'rev_test',
                    type: 'DocumentType',
                    someArbitraryField: 'test_value'
                };
            });

            it('sets auditMetadataFieldName field', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, {
                    username: 'John Doe',
                    endpoint: 'api/endpoint'
                }, auditOptions);
                assert.ok(!!auditDoc[auditOptions.auditMetadataFieldName]);
                assert.equal(auditDoc[auditOptions.auditMetadataFieldName].username, 'John Doe');
                assert.equal(auditDoc[auditOptions.auditMetadataFieldName].endpoint, 'api/endpoint');
                done();
            });


            it('sets type to audit and populates origin type field', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(auditDoc['a_metadata'][auditOptions.originTypeFieldName], 'DocumentType');
                assert.equal(auditDoc.type, 'audit');
                done();
            });

            it('removes original attachments field', function (done) {
                originalDocument._attachments = [
                    {
                        field: 'test'
                    }
                ];
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.ok(!auditDoc._attachments);
                done();
            });

            it('adds special attachments field', function (done) {
                originalDocument._attachments = [
                    {
                        field: 'test'
                    }
                ];
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(
                    JSON.stringify(auditDoc['a_metadata'][auditOptions.attachmentsFieldName]),
                    JSON.stringify(originalDocument._attachments)
                );
                done();
            });

            it('modifies type field according options', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(auditDoc[auditOptions.typeFieldName], 'audit');
                done();
            });

            it('doesnt modify type field if options.auditType == false', function (done) {
                var auditOptions = {
                    originIdFieldName: 'a_originId',
                    timestampBeforeFieldName: 'a_timestampBefore',
                    timestampAfterFieldName: 'a_timestampAfter',
                    deletedFieldName: 'a_deleted',
                    attachmentsFieldName: 'a_attachments',
                    auditMetadataFieldName: 'a_metadata',
                    typeFieldName: 'type',
                    originTypeFieldName: 'a_originType',
                    auditType: false
                };
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument,null,  auditOptions);
                assert.equal(auditDoc[auditOptions.typeFieldName], 'DocumentType');
                done();
            });

            it('doesnt modify type field if options.auditType is an empty string', function (done) {

                var auditOptions = {
                    originIdFieldName: 'a_originId',
                    timestampBeforeFieldName: 'a_timestampBefore',
                    timestampAfterFieldName: 'a_timestampAfter',
                    deletedFieldName: 'a_deleted',
                    attachmentsFieldName: 'a_attachments',
                    auditMetadataFieldName: 'a_metadata',
                    typeFieldName: 'type',
                    originTypeFieldName: 'a_originType',
                    auditType: ''
                };
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(auditDoc[auditOptions.typeFieldName], 'DocumentType');
                done();
            });

            it('sets timestamp after field', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.ok(!!auditDoc['a_metadata'][auditOptions.timestampAfterFieldName]);
                done();
            });

            it('populates origin id field with original doc _id', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(auditDoc['a_metadata'][auditOptions.originIdFieldName], originalDocument._id);
                done();
            });

            it('deletes _id and _rev fields from audit document', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.ok(!auditDoc[auditOptions._id]);
                assert.ok(!auditDoc[auditOptions._rev]);
                done();
            });

            it('preserves existing fields', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, null, auditOptions);
                assert.equal(auditDoc.someArbitraryField, originalDocument.someArbitraryField);
                done();
            });

            it('sets deleted field if deleted flag set', function (done) {
                var auditDoc = AuditableDatabase.createAuditDocument(originalDocument, {
                    'a_deleted': true
                }, auditOptions);

                assert.equal(auditDoc['a_metadata'][auditOptions.deletedFieldName], true);
                done();
            });
        });

        describe('when called with doc array', function () {
            var originalDocuments;
            beforeEach(function () {
                originalDocuments = [
                    {
                        _id: 'identifier_test',
                        _rev: 'rev_test',
                        type: 'DocumentType',
                        someArbitraryField: 'test_value'
                    },
                    {
                        _id: 'identifier_test_2',
                        _rev: 'rev_test_2',
                        type: 'DocumentType',
                        someArbitraryField: 'test_value_2'
                    },
                    {
                        _id: 'identifier_test_3',
                        _rev: 'rev_test_3',
                        type: 'DocumentType',
                        someArbitraryField: 'test_value_3'
                    }
                ];
            });

            it('returns the same number of elements', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);

                assert.equal(auditDocs.length, 3);
                done();
            });

            it('modifies type field according options', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);
                auditDocs.forEach(function (doc) {
                    assert.equal(doc[auditOptions.typeFieldName], 'audit');
                });
                done();
            });

            it('sets timestamp field', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);

                auditDocs.forEach(function (doc, i) {
                    assert.ok(!!doc['a_metadata'][auditOptions.timestampAfterFieldName]);
                    if (i > 0) {
                        // timestamps are the same
                        assert.equal(doc['a_metadata'][auditOptions.timestampAfterFieldName], auditDocs[i-1]['a_metadata'][auditOptions.timestampAfterFieldName]);
                    }
                });
                done();
            });

            it('populates origin id field with original doc _id', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);

                auditDocs.forEach(function (doc, i) {
                    assert.equal(doc['a_metadata'][auditOptions.originIdFieldName], originalDocuments[i]._id);
                });

                done();
            });

            it('deletes _id and _rev fields from audit document', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);

                auditDocs.forEach(function (doc) {
                    assert.ok(!doc[auditOptions._id]);
                    assert.ok(!doc[auditOptions._rev]);
                });

                done();
            });

            it('preserves existing fields', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, null, auditOptions);

                auditDocs.forEach(function (doc, i) {
                    assert.equal(doc.someArbitraryField, originalDocuments[i].someArbitraryField);
                });

                done();
            });

            it('sets deleted fields if deleted flag set', function (done) {
                var auditDocs = AuditableDatabase.createAuditDocument(originalDocuments, {
                    'a_deleted': true
                }, auditOptions);

                auditDocs.forEach(function (doc) {
                    assert.equal(doc['a_metadata'][auditOptions.deletedFieldName], true);
                });

                done();
            });
        });
    });
});
