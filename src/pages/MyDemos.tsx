import { MyDemosPanel } from '../components/sharp/MyDemosPanel';

/**
 * Thin page wrapper that hosts the My Demos panel. The component lives
 * under components/sharp/ for consistency with the rest of the demo UI
 * (DemoModePanel, RecipientDemoBanner); this file exists so App.tsx's
 * route table reads symmetrically with the other pages.
 */

interface Props {
  /** True when the connected wallet is the contract admin. Drives the
   *  empty-state pointer copy in the Sent-by-me tab. */
  isAdmin: boolean;
}

export default function MyDemos({ isAdmin }: Props) {
  return <MyDemosPanel isAdmin={isAdmin} />;
}
