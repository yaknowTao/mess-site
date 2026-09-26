import { useEffect, useState } from "react";

import MenuList from "./components/MenuList";
import Header from "./components/Header";
import LoginPage from "./pages/LoginPage";
import { getMe } from "./services/api";

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() =>
    localStorage.getItem("access_token")
  );
  const [checkingLogin, setCheckingLogin] = useState(true);

  useEffect(() => {
    async function checkLogin() {
      const savedToken = localStorage.getItem("access_token");

      if (!savedToken) {
        setCheckingLogin(false);
        return;
      }

      try {
        const currentUser = await getMe(savedToken);

        setUser(currentUser);
        setToken(savedToken);
      } catch (error) {
        // Token is invalid or expired.
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");

        setUser(null);
        setToken(null);
      } finally {
        setCheckingLogin(false);
      }
    }

    checkLogin();
  }, []);

  function handleLogin(userData, accessToken) {
    setUser(userData);
    setToken(accessToken);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    localStorage.removeItem("access_token");

    setUser(null);
    setToken(null);
  }

  if (checkingLogin) {
    return <p>Checking your login...</p>;
  }

  if (!user || !token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main>
      <Header name={user.name} />

      <button onClick={handleLogout}>Logout</button>

      <MenuList />
    </main>
  );
}

export default App;