import { NavLink } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import PerseusLogo from "./PerseusLogo";
import styles from "./NavBar.module.css";

export default function NavBar() {
  return (
    <nav className={styles.nav}>
      <div className={`layout-inner ${styles.inner}`}>
        <span className={styles.brand}>
          <PerseusLogo size={30} />
          Perseus
        </span>
        <div className={styles.links}>
          <NavLink to="/" end className={({ isActive }) => isActive ? styles.active : styles.link}>
            Stocks
          </NavLink>
          <NavLink to="/rankings" className={({ isActive }) => isActive ? styles.active : styles.link}>
            Value
          </NavLink>
          <NavLink to="/momentum" className={({ isActive }) => isActive ? styles.active : styles.link}>
            Momentum
          </NavLink>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </nav>
  );
}
