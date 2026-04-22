type Status = 'pending' | 'accepted' | 'approved' | 'claimed' | 'refunded' | 'disputed' | 'active' | 'released';

const STATUS_MAP: Record<Status, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#FBBF24', bg: 'rgba(251,191,36,0.10)'  },
  accepted: { label: 'Accepted', color: '#818CF8', bg: 'rgba(99,102,241,0.10)'  },
  approved: { label: 'Approved', color: '#34D399', bg: 'rgba(16,185,129,0.10)'  },
  active:   { label: 'Active',   color: '#818CF8', bg: 'rgba(99,102,241,0.10)'  },
  claimed:  { label: 'Claimed',  color: '#4CAF50', bg: 'rgba(76,175,80,0.08)'   },
  released: { label: 'Released', color: '#34D399', bg: 'rgba(52,211,153,0.08)'  },
  refunded: { label: 'Refunded', color: '#94A3B8', bg: 'rgba(148,163,184,0.08)' },
  disputed: { label: 'Disputed', color: '#F87171', bg: 'rgba(239,68,68,0.10)'   },
};

export function SharpBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as Status] ?? STATUS_MAP.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 0,
      background: s.bg, color: s.color, border: `1px solid ${s.color}30`,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {s.label}
    </span>
  );
}
