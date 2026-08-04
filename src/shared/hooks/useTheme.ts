import { useContext } from "react";
import { ThemeContext } from "../../context/themeContextValue";

/** Read and control the active colour theme. */
export const useTheme = () => useContext(ThemeContext);
