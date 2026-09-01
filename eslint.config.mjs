export default [
  {
    files: ["*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
    },
    rules: {
      "no-class-assign": "error",
      "no-const-assign": "error",
      "no-debugger": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-ex-assign": "error",
      "no-func-assign": "error",
      "no-obj-calls": "error",
      "no-self-assign": "error",
      "no-setter-return": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
];
