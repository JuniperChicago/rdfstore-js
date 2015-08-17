var gulp = require('gulp');
var browserify = require('gulp-browserify');
var rename     = require('gulp-rename');

var source = require('vinyl-source-stream');
var jasmine = require('gulp-jasmine');
var PEG = require('pegjs');
var fs = require('fs');
var electron = require('gulp-electron');
var packageJson = require('./package.json');
var del = require('del');
var closure = require('gulp-closure-compiler-service');


// gulp.task('clean-dist', function(){
//     return gulp.src('dist', {read: false})
//         .pipe(clean());
// });


gulp.task('clean-dist', function(cb) {
    del(['dist/*.js'], cb);
});


gulp.task('browserify', ['clean-dist'], function() {

    return gulp.src(['./src/store.js'])
        .pipe(browserify({
            standalone: 'rdfstore',
            exclude: ["sqlite3","indexeddb-js"]
        }))
        .pipe(rename('rdfstore.js'))
        .pipe(gulp.dest('./dist'));
});

gulp.task('minimize', ['browserify'], function() {
    return gulp.src('dist/*.js')
        .pipe(closure({language: 'ECMASCRIPT5'}))
        .pipe(rename('rdfstore_min.js'))
        .pipe(gulp.dest('./dist'));
});

gulp.task('performance',function(){
    require('./src/perftest/trees');
});

gulp.task('specs', function () {
    return gulp.src('./spec/*.js')
        .pipe(jasmine({includeStackTrace: true, verbose:true}));
});

gulp.task('parseGrammar', function(){
    fs.readFile('pegjs/sparql_query.grammar', 'utf8', function(err, grammar){
        if(err) {
            throw err;
        } else {
            var parser =  PEG.buildParser(grammar, {output: 'source', optimize: 'size'});
            fs.unlinkSync('src/parser.js');
            fs.writeFileSync('src/parser.js',"module.exports = "+parser);
        }
    });
});

gulp.task('frontend', function() {

    gulp.src("")
        .pipe(electron({
            src: './frontend',
            packageJson: packageJson,
            release: './release',
            cache: './cache',
            version: 'v0.30.4',
            packaging: true,
            platforms: ['win32-ia32', 'darwin-x64'],
            platformResources: {
                darwin: {
                    CFBundleDisplayName: packageJson.name,
                    CFBundleIdentifier: packageJson.name,
                    CFBundleName: packageJson.name,
                    CFBundleVersion: packageJson.version,
                    icon: './frontend/icons/rdfstore.icns'
                },
                win: {
                    "version-string": packageJson.version,
                    "file-version": packageJson.version,
                    "product-version": packageJson.version,
                    "icon": './frontend/icons/rdfstore.ico'
                }
            }
        }))
        .pipe(gulp.dest(""));
});

gulp.task('default', ['parseGrammar', 'specs']);
gulp.task('browser', ['parseGrammar', 'minimize']);
