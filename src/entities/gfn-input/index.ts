// Public API for the gfn-input entity (GeForce NOW's own remote-input wire
// protocol -- gamepad bitmask constants, key/mouse modifier codes, virtual
// key codes, and the packet encoder/session-clock/handshake parser). Kept
// separate from entities/gamepad (Xbox's own controller button-code
// mappings, an unrelated protocol) and below the features layer since both
// features/virtual-keyboard and GFN's own streaming-session internals
// depend on it -- two different features can't import each other directly,
// so this has to sit at a layer both can import from. Consumers outside
// this slice import from here, not from model/inputEncoding directly.
export * from './model/inputEncoding';
