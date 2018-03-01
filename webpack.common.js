const webpack = require('webpack');
const path = require('path');
const appPath = __dirname;
const distPath = path.join(__dirname, 'dist');
const exclude = [/node_modules/];
const CleanPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    context: appPath,
    entry: {
        app: ['@babel/polyfill', './src/index.js']
    },
    output: {
        path: distPath,
        filename: 'bundle.js'
    },
    plugins: [

        // Generate index.html with included script tags
        new HtmlWebpackPlugin({
            inject: 'body',
            template: './template.html'
        }),

        new CleanPlugin(['dist']),

    ],
    module: {
        noParse: [/app\/bin/],
        rules: [
            {
                test: /\.css$/,
                use: "css-loader"
            },
            {
                test: /.jsx?$/,
                exclude: exclude,
                loader: 'babel-loader',
                query: {
                    comments: false,
                    compact: false,
                    presets: [
                        "@babel/preset-env"
                    ],
                    plugins: [
                        "@babel/plugin-proposal-object-rest-spread",
                        "@babel/plugin-proposal-decorators"
                    ]
                }
            },
            {
                test: /\.(jpe?g|png|gif|json)$/i,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 8192
                        }
                    }
                ]
            },
            {
                test: /\.svg$/,
                use: [
                    {
                        loader: "babel-loader",
                        query: {
                            comments: false,
                            compact: false,
                            presets: [
                                "@babel/preset-react",
                                "@babel/preset-env"
                            ]
                        }
                    },
                    {
                        loader: "react-svg-loader"
                    }
                ]
            }
        ]
    },
    resolve: {
        modules: [
            appPath,
            "node_modules"
        ]
    },
    node: {
        fs: 'empty'
    }
};