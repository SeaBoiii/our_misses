import { useId } from "react";
import { colors } from "./liquids";
export function Bottle({
  layers,
  patterns = false,
  skin = "classic",
  complete = false,
  note = false,
  idPrefix,
  drain = 0,
  hiddenCount = 0,
}: {
  layers: number[];
  patterns?: boolean;
  skin?: string;
  complete?: boolean;
  note?: boolean;
  idPrefix?: string;
  drain?: number;
  hiddenCount?: number;
}) {
  const autoId = useId().replace(/:/g, "");
  const id = idPrefix ?? autoId;
  const concealed = Math.max(0, Math.min(hiddenCount, layers.length - 1));
  const visibleColors = new Set(layers.slice(concealed));
  const hiddenSurface = "#a4acbb";
  const shape =
    skin === "potion"
      ? "M27 12H53V38C53 50 69 57 69 80V143Q69 158 54 158H26Q11 158 11 143V80C11 57 27 50 27 38Z"
      : skin === "perfume"
        ? "M27 12H53V38L68 53V145Q68 158 55 158H25Q12 158 12 145V53L27 38Z"
        : skin === "cloud"
          ? "M21 12H59V44Q70 47 68 65V142Q68 161 51 157Q40 163 29 157Q12 160 12 142V65Q10 47 21 44Z"
          : skin === "wedding"
            ? "M22 12H58V37Q58 45 63 51L66 139Q66 158 49 158H31Q14 158 14 139L17 51Q22 45 22 37Z"
            : "M20 12H60V39Q60 47 65 52V143Q65 158 50 158H30Q15 158 15 143V52Q20 47 20 39Z";
  return (
    <svg
      className={`bottle-svg ${complete ? "complete" : ""}`}
      viewBox="0 0 80 174"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={shape} />
        </clipPath>
        {drain > 0 && (
          <clipPath id={`${id}-drain`}>
            <rect x="0" y={152 - layers.length * 26} width="80" height="174">
              <animate
                attributeName="y"
                from={152 - layers.length * 26}
                to={155 - (layers.length - drain) * 26}
                begin="0.2s"
                dur="0.25s"
                fill="freeze"
              />
            </rect>
          </clipPath>
        )}
        <linearGradient
          id={`${id}-glass`}
          x1="10"
          y1="30"
          x2="71"
          y2="130"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c8c7ff" stopOpacity=".15" />
          <stop offset=".5" stopColor="#b8baff" stopOpacity=".025" />
          <stop offset="1" stopColor="#d4d2ff" stopOpacity=".12" />
        </linearGradient>
        <linearGradient
          id={`${id}-rim`}
          x1="13"
          y1="20"
          x2="70"
          y2="158"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            stopColor={skin === "wedding" ? "#f0d7a4" : "#e0defe"}
            stopOpacity=".65"
          />
          <stop offset=".5" stopColor="#bbbdff" stopOpacity=".16" />
          <stop
            offset="1"
            stopColor={skin === "wedding" ? "#e5c888" : "#d1d6ff"}
            stopOpacity=".44"
          />
        </linearGradient>
        <linearGradient
          id={`${id}-unknown`}
          x1="15"
          x2="65"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#707989" />
          <stop offset=".3" stopColor={hiddenSurface} />
          <stop offset="1" stopColor="#707989" />
        </linearGradient>
        {[...visibleColors].map((i) => (
          <linearGradient
            key={i}
            id={`${id}-c${i}`}
            x1="15"
            x2="65"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={colors[i]?.hex} />
            <stop offset=".3" stopColor={colors[i]?.light} />
            <stop offset="1" stopColor={colors[i]?.hex} />
          </linearGradient>
        ))}
      </defs>
      <ellipse cx="40" cy="168" rx="26" ry="3" fill="#02030d" opacity=".4" />
      <path d={shape} fill={`url(#${id}-glass)`} />
      <g clipPath={`url(#${id}-clip)`}>
        <g clipPath={drain > 0 ? `url(#${id}-drain)` : undefined}>
          {layers.map((color, i) => (
            <g key={i} className="liquid-layer">
              <path
                d={`M8 ${155 - (i + 1) * 26}Q40 ${151 - (i + 1) * 26} 72 ${155 - (i + 1) * 26}V${157 - i * 26}H8Z`}
                fill={`url(#${id}-${i < concealed ? "unknown" : `c${color}`})`}
              />
              {(patterns || i < concealed) && (
                <text
                  x="40"
                  y={147 - i * 26}
                  textAnchor="middle"
                  fill={i < concealed ? "#1d283b" : "#142137"}
                  fontSize="15"
                  fontWeight="700"
                >
                  {i < concealed ? "?" : colors[color]?.symbol}
                </text>
              )}
            </g>
          ))}
        </g>
        {layers.length > 0 && (
          <ellipse
            cx="40"
            cy={155 - layers.length * 26}
            rx="31"
            ry="2.5"
            fill={colors[layers[layers.length - 1]]?.light}
            opacity=".9"
          >
            {drain > 0 && (
              <>
                <animate
                  attributeName="cy"
                  from={155 - layers.length * 26}
                  to={155 - (layers.length - drain) * 26}
                  begin="0.2s"
                  dur="0.25s"
                  fill="freeze"
                />
                {concealed > 0 && layers.length - drain <= concealed && (
                  <set
                    attributeName="fill"
                    to={hiddenSurface}
                    begin="0.45s"
                    fill="freeze"
                  />
                )}
              </>
            )}
          </ellipse>
        )}
        <path
          d="M22 53v84q0 10 6 12"
          stroke="white"
          opacity=".24"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M58 63v62"
          stroke="white"
          opacity=".1"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="m16 110 51-25v11l-51 25Z" fill="white" opacity=".035" />
        {note && (
          <g transform="rotate(-12 40 106)">
            <rect x="25" y="85" width="30" height="40" rx="3" fill="#eee1c4" />
            <path
              d="m25 85 15 14 15-14M32 108h16m-16 5h11"
              stroke="#ab967e"
              strokeWidth="1.2"
            />
            <path d="M40 101c-4-5-8 1 0 5 8-4 4-10 0-5" fill="#b88195" />
          </g>
        )}
      </g>
      <path d={shape} stroke={`url(#${id}-rim)`} strokeWidth="1.5" />
      <path
        d="M20 12q20 3 40 0M21 17h38"
        stroke="#d9d7ff"
        strokeOpacity=".43"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M24 21v15"
        stroke="white"
        opacity=".25"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {skin === "cat" && (
        <g stroke="#f2dbff" strokeWidth="1.5" opacity=".7">
          <path d="m20 52-3-12 13 7m30 5 3-12-13 7M30 59h-7m27 0h7m-23 4 6 4 6-4" />
          <circle cx="31" cy="54" r="1" />
          <circle cx="49" cy="54" r="1" />
        </g>
      )}
      {skin === "stars" && (
        <g fill="#fff5cc" opacity=".6">
          <path d="m40 66 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" />
          <circle cx="27" cy="91" r="1.7" />
          <circle cx="52" cy="113" r="2" />
        </g>
      )}
      {complete && (
        <g className="bottle-check">
          <circle cx="40" cy="34" r="9" fill="#182f32" />
          <path
            d="m36 34 3 3 5-6"
            stroke="#a5e9d0"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
