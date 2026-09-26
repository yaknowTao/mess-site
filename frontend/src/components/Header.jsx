function Header({ name }) {
  return (
    <header>
      <h1>{name ? `Welcome, ${name}` : "Welcome to MessMate"}</h1>
    </header>
  );
}

export default Header;