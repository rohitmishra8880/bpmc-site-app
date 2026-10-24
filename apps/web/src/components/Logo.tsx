import { useState } from "react";

/** BPMC logo (public/bpmc-logo*.png — G:\My Drive\B.P MISHRA PROFILE\logo\BPMC_logo.png se). File na ho to "BPMC" gol nishaan. */
export const LOGO_SRC = "/bpmc-logo.png";

export function Logo({ size = 44 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className="mark" style={{ width: size, height: size }}>BPMC</div>;
  return <img src={size <= 96 ? "/bpmc-logo-192.png" : LOGO_SRC} alt="BP Mishra & Co." width={size} height={size} className="logo-img" onError={() => setOk(false)} />;
}
