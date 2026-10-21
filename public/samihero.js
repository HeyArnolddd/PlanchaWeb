// Sami en vectores (SVG) para el login: se anima con CSS, así no depende de cuadros ni de resolución.
// El estado va en data-s (dance, notice, watch, cover, peek, sad, happy) y la variante de baile en data-v.
window.samiSVG = () => `
<svg id="sami" class="sami" data-s="dance" data-v="groove" viewBox="0 0 300 340" role="img" aria-label="Sami, el pingüino">
  <defs>
    <linearGradient id="sgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3446"/><stop offset="1" stop-color="#0b0f17"/></linearGradient>
    <linearGradient id="sgBelly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e4f5"/></linearGradient>
    <linearGradient id="sgHat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58c56a"/><stop offset="1" stop-color="#1f7a34"/></linearGradient>
    <linearGradient id="sgFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6847"/><stop offset="1" stop-color="#5e3823"/></linearGradient>
    <linearGradient id="sgBeak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc15a"/><stop offset="1" stop-color="#f08a1a"/></linearGradient>
    <linearGradient id="sgBow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5b6b"/><stop offset="1" stop-color="#c81d33"/></linearGradient>
  </defs>
  <g class="all">
    <g class="foot l"><ellipse cx="112" cy="319" rx="36" ry="14" fill="url(#sgBeak)"/></g>
    <g class="foot r"><ellipse cx="188" cy="319" rx="36" ry="14" fill="url(#sgBeak)"/></g>
    <ellipse cx="150" cy="240" rx="88" ry="84" fill="url(#sgBody)"/>
    <ellipse cx="150" cy="258" rx="58" ry="64" fill="url(#sgBelly)"/>
    <g class="head">
      <ellipse cx="150" cy="132" rx="84" ry="72" fill="url(#sgBody)"/>
      <g class="face">
        <ellipse cx="121" cy="144" rx="35" ry="34" fill="#fff"/><ellipse cx="179" cy="144" rx="35" ry="34" fill="#fff"/>
        <ellipse cx="150" cy="152" rx="40" ry="30" fill="#fff"/>
        <g transform="translate(0 7)"><circle cx="102" cy="164" r="9" fill="#ff8fa3" opacity=".5"/><circle cx="198" cy="164" r="9" fill="#ff8fa3" opacity=".5"/>
        <g class="ey l">
          <g class="eyeOpen"><g class="pupil"><circle cx="122" cy="143" r="11" fill="#0b0f17"/><circle cx="126" cy="138" r="4" fill="#fff"/><circle cx="118" cy="148" r="2" fill="#fff"/></g></g>
          <path class="eyeHappy" d="M107 147 Q122 127 137 147" fill="none" stroke="#0b0f17" stroke-width="6" stroke-linecap="round"/>
        </g>
        <g class="ey r">
          <g class="eyeOpen"><g class="pupil"><circle cx="178" cy="143" r="11" fill="#0b0f17"/><circle cx="182" cy="138" r="4" fill="#fff"/><circle cx="174" cy="148" r="2" fill="#fff"/></g></g>
          <path class="eyeHappy" d="M163 147 Q178 127 193 147" fill="none" stroke="#0b0f17" stroke-width="6" stroke-linecap="round"/>
        </g>
        <path d="M134 158 Q150 148 166 158 Q162 181 150 183 Q138 181 134 158Z" fill="url(#sgBeak)"/>
        <path d="M141 160 Q150 155 159 160" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
        <g class="tears"><path class="tear" d="M100 170 q-7 12 0 17 q7 -5 0 -17z" fill="#7cc4ff"/><path class="tear t2" d="M200 170 q-7 12 0 17 q7 -5 0 -17z" fill="#7cc4ff"/></g>
      </g>
      <g class="hat">
        <g class="flap l"><path d="M82 100 C44 104 32 160 50 188 C62 204 86 196 92 174 L98 108Z" fill="url(#sgFur)"/>
          <circle cx="52" cy="150" r="9" fill="#a8744f"/><circle cx="60" cy="176" r="10" fill="#a8744f"/><circle cx="78" cy="190" r="8" fill="#8a5a3c"/><circle cx="46" cy="128" r="8" fill="#8a5a3c"/></g>
        <g class="flap r"><path d="M218 100 C256 104 268 160 250 188 C238 204 214 196 208 174 L202 108Z" fill="url(#sgFur)"/>
          <circle cx="248" cy="150" r="9" fill="#a8744f"/><circle cx="240" cy="176" r="10" fill="#a8744f"/><circle cx="222" cy="190" r="8" fill="#8a5a3c"/><circle cx="254" cy="128" r="8" fill="#8a5a3c"/></g>
        <path d="M70 112 C66 52 108 20 150 20 C192 20 234 52 230 112 Z" fill="url(#sgHat)"/>
        <path d="M92 66 C104 42 126 32 146 32" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/>
        <path d="M62 112 Q62 92 84 94 L216 94 Q238 92 238 112 Q238 132 218 130 Q206 140 194 130 Q182 140 170 130 Q158 140 146 130 Q134 140 122 130 Q110 140 98 130 Q80 134 62 112Z" fill="url(#sgFur)"/>
        <g fill="#b07c55" opacity=".8"><circle cx="86" cy="108" r="6"/><circle cx="116" cy="112" r="6"/><circle cx="150" cy="108" r="6"/><circle cx="184" cy="112" r="6"/><circle cx="214" cy="108" r="6"/></g>
      </g>
      <g class="sparks" fill="none" stroke="#ffc83d" stroke-width="6" stroke-linecap="round"><path d="M52 62 L34 50 M44 88 L22 84"/><path d="M248 62 L266 50 M256 88 L278 84"/></g>
    </g>
    <g class="bow"><path d="M150 206 L120 190 L120 224Z" fill="url(#sgBow)"/><path d="M150 206 L180 190 L180 224Z" fill="url(#sgBow)"/><circle cx="150" cy="206" r="9" fill="#e0243a"/></g>
    <g class="armW l"><g class="arm l"><path d="M76 182 C44 192 38 244 56 272 C68 286 92 266 94 232 C96 208 92 188 76 182Z" fill="url(#sgBody)"/><path d="M62 236 C58 252 62 264 68 270" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5" stroke-linecap="round"/></g></g>
    <g class="armW r"><g class="arm r"><path d="M224 182 C256 192 262 244 244 272 C232 286 208 266 206 232 C204 208 208 188 224 182Z" fill="url(#sgBody)"/><path d="M238 236 C242 252 238 264 232 270" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5" stroke-linecap="round"/></g></g>
  </g>
</svg>`;
