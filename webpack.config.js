const path = require('path')

module.exports = {
  devtool: "inline-source-map",
  entry: {
    main: "./client/index.ts",
  },
  output: {
    path: path.resolve(__dirname, './build'),
    filename: "index.js"
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      { 
        test: /\.ts?$/,
        loader: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  devServer: {
    static: path.join(__dirname, "build"),
    compress: true,
    port: 4000,
  },
}
