module.exports = {
  plugins: {
    "postcss-preset-mantine": {},
    // gleiche Werte wie apps/client (für die übernommenen Editor-Styles der Web-Version)
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};
