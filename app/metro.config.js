const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Bundle TFLite models and audio clips as assets.
config.resolver.assetExts.push('tflite');

module.exports = config;
