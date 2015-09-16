module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-simple-mocha');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.initConfig({
        watch: {
            options: {
                maxListeners: 99
            },
            scripts: {
                files: ['src/**/*.js', 'test/**/*.js'],
                tasks: ['jshint', 'simplemocha']
            }
        },
        jshint: {
            options: grunt.file.readJSON('.jshintrc'),
            'all_js': {
                files: {
                    src: [
                        '**/*.js',
                        '!**/bower_components/**',
                        '!**/build/**',
                        '!**/node_modules/**'
                    ]
                }
            }
        },

        simplemocha: {
            all: {
                src: [
                    'test/**/*.js'
                ]
            }
        }
    });

    grunt.registerTask('validate', ['jshint', 'simplemocha']);
};
