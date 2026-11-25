// Coordinates in the top-view drawing. The two halves of a breadboard strip
// are electrically separate; the probe uses the F–J half of rows 13 to 15.
export const SIZE = { width: 1000, height: 490 };

export function gpio(pin) {
  return [80 + 12 * Math.floor((pin - 1) / 2), pin % 2 ? 202 : 187];
}

export function rail(sign, row) {
  return [530 + 20 * (row - 1), sign === "+" ? 160 : 181];
}

export function hole(letter, row) {
  const index = "ABCDEFGHIJ".indexOf(letter);
  return [530 + 20 * (row - 1), index < 5 ? 220 + index * 17 : 318 + (index - 5) * 17];
}

export const wires = [
  {
    id: "power-feed", name: "Power feed", type: "Supply jumper", color: "#ff806b",
    from: { point: gpio(1), name: "Pi 3.3 V", detail: "GPIO header · physical pin 1" },
    to: { point: rail("+", 2), name: "Positive rail", detail: "Breadboard · + rail, hole 2" },
    bends: [[80, 66], [550, 66]],
    purpose: "Feeds the positive rail with 3.3 V from the Pi. The probe supply jumper and the pull-up resistor both draw from this rail.",
  },
  {
    id: "ground-feed", name: "Ground feed", type: "Ground jumper", color: "#86b8f3",
    from: { point: gpio(6), name: "Pi ground", detail: "GPIO header · physical pin 6" },
    to: { point: rail("−", 4), name: "Ground rail", detail: "Breadboard · − rail, hole 4" },
    bends: [[104, 92], [590, 92]],
    purpose: "Connects the ground rail to the Pi, giving the circuit a shared zero-volt reference.",
  },
  {
    id: "data", name: "1-Wire data", type: "Signal jumper", color: "#f4c955",
    from: { point: gpio(7), name: "BCM GPIO4", detail: "GPIO header · physical pin 7" },
    to: { point: hole("J", 14), name: "DS18B20 DQ row", detail: "J14 shares a strip with probe DQ at F14." },
    bends: [[116, 118], [457, 118], [457, 386]],
    probePin: hole("F", 14),
    purpose: "Carries 1-Wire commands from the Pi and the probe’s temperature response back along the same data line.",
  },
  {
    id: "probe-supply", name: "Probe supply", type: "Supply jumper", color: "#ff806b",
    from: { point: rail("+", 20), name: "Positive rail", detail: "Breadboard · + rail, hole 20" },
    to: { point: hole("H", 15), name: "DS18B20 VDD row", detail: "H15 shares a strip with probe VDD at F15." },
    bends: [[910, 352]],
    probePin: hole("F", 15),
    purpose: "Supplies 3.3 V from the positive rail to the thermometer’s VDD pin.",
  },
  {
    id: "probe-ground", name: "Probe ground", type: "Ground jumper", color: "#86b8f3",
    from: { point: rail("−", 8), name: "Ground rail", detail: "Breadboard · − rail, hole 8" },
    to: { point: hole("H", 13), name: "DS18B20 GND row", detail: "H13 shares a strip with probe GND at F13." },
    bends: [[670, 352]],
    probePin: hole("F", 13),
    purpose: "Connects the thermometer’s GND pin to the shared ground rail, completing its power return to the Pi.",
  },
  {
    id: "pull-up", name: "Pull-up resistor", type: "4.7 kΩ resistor", color: "#c99bdf",
    from: { point: rail("+", 18), name: "Positive rail", detail: "Breadboard · + rail, hole 18" },
    to: { point: hole("G", 14), name: "DS18B20 DQ row", detail: "G14 shares a strip with probe DQ at F14." },
    bends: [[870, 335]],
    probePin: hole("F", 14),
    purpose: "Holds the data line near 3.3 V while the bus is idle. Its resistance allows either device to pull the line low during communication.",
  },
];
