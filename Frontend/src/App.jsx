import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import UserRoutes from './modules/user/routes';
import VendorRoutes from './modules/vendor/routes';

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
      <Routes>
        <Route path="/vendor/*" element={<VendorRoutes />} />
      </Routes>
      <UserRoutes />
    </BrowserRouter>
  );
}

export default App;

