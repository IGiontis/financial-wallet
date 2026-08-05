import { useContext } from "react";
import { AuthContext } from "../../context/authContextValue";

/** Use this anywhere in the app: const { currentUser } = useAuth() */
export const useAuth = () => useContext(AuthContext);
