export type DiscountRate = 20 | 25 | 30 | 35 | 40;

export type PriceRow = {
  label: string;
  base: number;
  vat: number;
  total: number;
  discounts: Record<DiscountRate, number>;
};

export type PricingBand = {
  id: string;
  label: string;
  minSeats?: number;
  maxSeats?: number;
  exactSeats?: number;
  isPickup?: boolean;
  price: PriceRow;
};

export type TruckBand = {
  id: string;
  label: string;
  minTons?: number;
  maxTons?: number;
  exactTons?: number;
  price: PriceRow;
};

export const vatRate = 0.1;
export const over25SeatFormulaBase = 4813000;
export const over25SeatFormulaIncrement = 30000;

function buildPriceRow(label: string, base: number): PriceRow {
  const vat = Math.round(base * vatRate);
  const total = base + vat;
  const buildDiscountTotal = (rate: DiscountRate) => {
    const discountedBase = Math.round(base * (1 - rate / 100));
    return discountedBase + Math.round(discountedBase * vatRate);
  };

  return {
    label,
    base,
    vat,
    total,
    discounts: {
      20: buildDiscountTotal(20),
      25: buildDiscountTotal(25),
      30: buildDiscountTotal(30),
      35: buildDiscountTotal(35),
      40: buildDiscountTotal(40),
    },
  };
}

export const nonBusinessBands: PricingBand[] = [
  {
    id: 'nb-under-6',
    label: 'Xe duoi 6 cho (khong kinh doanh)',
    maxSeats: 5,
    price: buildPriceRow('Duoi 6 cho', 437000),
  },
  {
    id: 'nb-6-11',
    label: 'Xe 6-11 cho (khong kinh doanh)',
    minSeats: 6,
    maxSeats: 11,
    price: buildPriceRow('6 den 11 cho', 794000),
  },
  {
    id: 'nb-12-24',
    label: 'Xe 12-24 cho (khong kinh doanh)',
    minSeats: 12,
    maxSeats: 24,
    price: buildPriceRow('12 den 24 cho', 1270000),
  },
  {
    id: 'nb-over-24',
    label: 'Xe tren 24 cho (khong kinh doanh)',
    minSeats: 25,
    price: buildPriceRow('Tren 24 cho', 1825000),
  },
  {
    id: 'nb-pickup',
    label: 'Pickup/Minivan (khong kinh doanh)',
    isPickup: true,
    price: buildPriceRow('Pickup/Minivan', 437000),
  },
];

const businessSeatBaseRows: Array<[number, number]> = [
  [6, 929000],
  [7, 1080000],
  [8, 1253000],
  [9, 1404000],
  [10, 1512000],
  [11, 1656000],
  [12, 1822000],
  [13, 2049000],
  [14, 2221000],
  [15, 2394000],
  [16, 3054000],
  [17, 2718000],
  [18, 2869000],
  [19, 3041000],
  [20, 3191000],
  [21, 3364000],
  [22, 3515000],
  [23, 3688000],
  [24, 4632000],
  [25, 4813000],
  [29, 4933000],
  [40, 5263000],
];

export const businessBands: PricingBand[] = [
  {
    id: 'b-under-6',
    label: 'Duoi 6 cho (kinh doanh)',
    maxSeats: 5,
    price: buildPriceRow('Duoi 6 cho', 756000),
  },
  ...businessSeatBaseRows.map(([seats, base]) => ({
    id: `b-${seats}`,
    label: `${seats} cho (kinh doanh)`,
    exactSeats: seats,
    price: buildPriceRow(`${seats} cho`, base),
  })),
  {
    id: 'b-pickup',
    label: 'Pickup/Minivan (kinh doanh)',
    isPickup: true,
    price: buildPriceRow('Pickup/Minivan', 933000),
  },
];

export const truckBands: TruckBand[] = [
  {
    id: 't-under-3',
    label: 'Duoi 3 tan',
    maxTons: 3,
    price: buildPriceRow('Duoi 3 tan', 853000),
  },
  {
    id: 't-3-8',
    label: 'Tu 3 den 8 tan',
    minTons: 3,
    maxTons: 8,
    price: buildPriceRow('3 den 8 tan', 1660000),
  },
  {
    id: 't-8-15',
    label: 'Tren 8 den 15 tan',
    minTons: 8,
    maxTons: 15,
    price: buildPriceRow('8 den 15 tan', 2746000),
  },
  {
    id: 't-over-15',
    label: 'Tren 15 tan',
    minTons: 15,
    price: buildPriceRow('Tren 15 tan', 3200000),
  },
  {
    id: 't-tractor',
    label: 'Xe dau keo',
    exactTons: 0,
    price: buildPriceRow('Xe dau keo', 4800000),
  },
];
