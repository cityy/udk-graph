const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const devMode = process.env.NODE_ENV !== 'production';

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'public/js')
  },
  plugins: [
      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: devMode ? '../css/[name].css' : '../css/[name].[hash].css',
        chunkFilename: devMode ? '../css/[id].css' : '../css/[id].[hash].css',
      }),
  ],
  module: {
    rules: [
      {
        test: /\.(sa|sc|c)ss$/,
        use : [
          {
            loader : MiniCssExtractPlugin.loader,
            options: {
              hmr: process.env.NODE_ENV === 'development',
            },
          },
          'css-loader',
          // 'postcss-loader',
          'sass-loader',
        ],
      }, //css and sass
      {
        test   : /\.(ttf|eot|svg|woff(2)?)(\?[a-z0-9=&.]+)?$/,
        loader : 'file-loader'
      }, // fonts
    ], // rules
  },
};