import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import UserRoutes from './modules/user/routes';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <UserRoutes />
    </BrowserRouter>
  )
}

export default App;

