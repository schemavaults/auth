import LocalFont from "next/font/local";

const inter = LocalFont({
  src: [
    {
      path: "./Inter-VariableFont_opsz,wght.ttf",
    },
    {
      path: "./Inter-Italic-VariableFont_opsz,wght.ttf",
      style: "italic",
    },
  ],
});

export { inter };
