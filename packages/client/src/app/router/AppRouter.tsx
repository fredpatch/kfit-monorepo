import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { adminRoutes } from "./admin-routes.js";
import { publicRoutes } from "./public-routes.js";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {publicRoutes()}
        {adminRoutes()}
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
