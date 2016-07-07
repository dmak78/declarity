var path = require('path');
var webpack = require("webpack");

module.exports = {
    entry: [
        "./src/index.js"
    ],
    output: {
        path: __dirname + '/build/',
        filename: 'bundle.js',
        publicPath: '/build/',
        library: "declarity",
        libraryTarget: "umd"
    },
    resolve: {
        extensions: ['', '.js', '.jsx']
    },
    externals: {
        "immutable": "immutable"
    },
    module: {
        loaders: [{
            test: /\.js$/,
            loader: 'babel',
            include: path.join(__dirname, 'src'),
            query: {
                cacheDirectory: true,
                presets: ["es2015", "stage-0"]
            }
        }, {
            test: /\.js$/,
            loader: "eslint-loader",
            exclude: /node_modules/
        }]
    },
    resolve: {
        extensions: ['', '.js']
    }
}