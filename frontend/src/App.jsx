import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import NavBar from "./components/NavBar";
import HomePage from "./pages/HomePage";
import AddPage from "./pages/AddPage";
import EditPage from "./pages/EditPage";
import DetailPage from "./pages/DetailPage";
import RankingsPage from "./pages/RankingsPage";
import MomentumPage from "./pages/MomentumPage";
import RecessionPage from "./pages/RecessionPage";

function ProtectedRoutes() {
  return (
    <>
      <NavBar />
      <div className="layout-inner" style={{ paddingTop: "1.5rem", paddingBottom: "3rem" }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/stocks/new" element={<AddPage />} />
          <Route path="/stocks/:ticker" element={<DetailPage />} />
          <Route path="/stocks/:ticker/edit" element={<EditPage />} />
          <Route path="/rankings" element={<RankingsPage />} />
          <Route path="/momentum" element={<MomentumPage />} />
          <Route path="/recession" element={<RecessionPage />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SignedIn>
        <ProtectedRoutes />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </BrowserRouter>
  );
}
