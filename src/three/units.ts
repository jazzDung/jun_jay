/**
 * Dữ liệu lưu bằng cm; scene Three.js dùng mét. Mọi chuyển đổi đi qua đây.
 * Mặt bằng (x, z) của dữ liệu map thẳng sang (x, z) của Three.js, y hướng lên.
 */
export const CM = 0.01;
export const cm = (v: number): number => v * CM;
export const toCm = (m: number): number => m / CM;
