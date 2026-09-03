module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_PUBLIC_API_URL);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};