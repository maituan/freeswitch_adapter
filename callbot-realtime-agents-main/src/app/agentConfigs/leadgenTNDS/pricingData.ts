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

export const nonBusinessBands: PricingBand[] = [
  {
    id: 'nb-under-6',
    label: 'Xe duoi 6 cho (khong kinh doanh)',
    maxSeats: 5,
    price: {
      label: 'Duoi 6 cho',
      base: 437000,
      vat: 43700,
      total: 480700,
      discounts: {
        20: 409300,
        25: 387450,
        30: 365600,
        35: 343750,
        40: 321900,
      },
    },
  },
  {
    id: 'nb-6-11',
    label: 'Xe 6-11 cho (khong kinh doanh)',
    minSeats: 6,
    maxSeats: 11,
    price: {
      label: '6 den 11 cho',
      base: 794000,
      vat: 79400,
      total: 873400,
      discounts: {
        20: 730600,
        25: 690900,
        30: 651200,
        35: 611500,
        40: 571800,
      },
    },
  },
  {
    id: 'nb-12-24',
    label: 'Xe 12-24 cho (khong kinh doanh)',
    minSeats: 12,
    maxSeats: 24,
    price: {
      label: '12 den 24 cho',
      base: 1270000,
      vat: 127000,
      total: 1397000,
      discounts: {
        20: 1159000,
        25: 1095500,
        30: 1032000,
        35: 968500,
        40: 905000,
      },
    },
  },
  {
    id: 'nb-over-24',
    label: 'Xe tren 24 cho (khong kinh doanh)',
    minSeats: 25,
    price: {
      label: 'Tren 24 cho',
      base: 1825000,
      vat: 182500,
      total: 2007500,
      discounts: {
        20: 1658500,
        25: 1567250,
        30: 1476000,
        35: 1384750,
        40: 1293500,
      },
    },
  },
  {
    id: 'nb-pickup',
    label: 'Pickup/Minivan (khong kinh doanh)',
    isPickup: true,
    price: {
      label: 'Pickup/Minivan',
      base: 437000,
      vat: 43700,
      total: 480700,
      discounts: {
        20: 409300,
        25: 387450,
        30: 365600,
        35: 343750,
        40: 321900,
      },
    },
  },
];

export const businessBands: PricingBand[] = [
  {
    id: 'b-under-6',
    label: 'Duoi 6 cho (kinh doanh)',
    maxSeats: 5,
    price: {
      label: 'Duoi 6 cho',
      base: 756000,
      vat: 75600,
      total: 831600,
      discounts: {
        20: 696400,
        25: 658600,
        30: 620800,
        35: 583000,
        40: 545200,
      },
    },
  },
  {
    id: 'b-6',
    label: '6 cho (kinh doanh)',
    exactSeats: 6,
    price: {
      label: '6 cho',
      base: 929000,
      vat: 92900,
      total: 1021900,
      discounts: {
        20: 852100,
        25: 805650,
        30: 759200,
        35: 712750,
        40: 666300,
      },
    },
  },
  {
    id: 'b-7',
    label: '7 cho (kinh doanh)',
    exactSeats: 7,
    price: {
      label: '7 cho',
      base: 1080000,
      vat: 108000,
      total: 1188000,
      discounts: {
        20: 988000,
        25: 934000,
        30: 880000,
        35: 826000,
        40: 772000,
      },
    },
  },
  {
    id: 'b-8',
    label: '8 cho (kinh doanh)',
    exactSeats: 8,
    price: {
      label: '8 cho',
      base: 1253000,
      vat: 125300,
      total: 1378300,
      discounts: {
        20: 1143700,
        25: 1081050,
        30: 1018400,
        35: 955750,
        40: 893100,
      },
    },
  },
  {
    id: 'b-9',
    label: '9 cho (kinh doanh)',
    exactSeats: 9,
    price: {
      label: '9 cho',
      base: 1404000,
      vat: 140400,
      total: 1544400,
      discounts: {
        20: 1279600,
        25: 1209400,
        30: 1139200,
        35: 1069000,
        40: 998800,
      },
    },
  },
  {
    id: 'b-10',
    label: '10 cho (kinh doanh)',
    exactSeats: 10,
    price: {
      label: '10 cho',
      base: 1512000,
      vat: 151200,
      total: 1663200,
      discounts: {
        20: 1376800,
        25: 1301200,
        30: 1225600,
        35: 1150000,
        40: 1074400,
      },
    },
  },
  {
    id: 'b-11',
    label: '11 cho (kinh doanh)',
    exactSeats: 11,
    price: {
      label: '11 cho',
      base: 1656000,
      vat: 165600,
      total: 1821600,
      discounts: {
        20: 1506400,
        25: 1423600,
        30: 1340800,
        35: 1258000,
        40: 1175200,
      },
    },
  },
  {
    id: 'b-12',
    label: '12 cho (kinh doanh)',
    exactSeats: 12,
    price: {
      label: '12 cho',
      base: 1822000,
      vat: 182200,
      total: 2004200,
      discounts: {
        20: 1655800,
        25: 1564700,
        30: 1473600,
        35: 1382500,
        40: 1291400,
      },
    },
  },
  {
    id: 'b-13',
    label: '13 cho (kinh doanh)',
    exactSeats: 13,
    price: {
      label: '13 cho',
      base: 2049000,
      vat: 204900,
      total: 2253900,
      discounts: {
        20: 1860100,
        25: 1757650,
        30: 1655200,
        35: 1552750,
        40: 1450300,
      },
    },
  },
  {
    id: 'b-14',
    label: '14 cho (kinh doanh)',
    exactSeats: 14,
    price: {
      label: '14 cho',
      base: 2221000,
      vat: 222100,
      total: 2443100,
      discounts: {
        20: 2014900,
        25: 1903850,
        30: 1792800,
        35: 1681750,
        40: 1570700,
      },
    },
  },
  {
    id: 'b-15',
    label: '15 cho (kinh doanh)',
    exactSeats: 15,
    price: {
      label: '15 cho',
      base: 2394000,
      vat: 239400,
      total: 2633400,
      discounts: {
        20: 2170600,
        25: 2050900,
        30: 1931200,
        35: 1811500,
        40: 1691800,
      },
    },
  },
  {
    id: 'b-16',
    label: '16 cho (kinh doanh)',
    exactSeats: 16,
    price: {
      label: '16 cho',
      base: 3054000,
      vat: 305400,
      total: 3359400,
      discounts: {
        20: 2764600,
        25: 2611900,
        30: 2459200,
        35: 2306500,
        40: 2153800,
      },
    },
  },
  {
    id: 'b-17',
    label: '17 cho (kinh doanh)',
    exactSeats: 17,
    price: {
      label: '17 cho',
      base: 2718000,
      vat: 271800,
      total: 2989800,
      discounts: {
        20: 2462200,
        25: 2326300,
        30: 2190400,
        35: 2054500,
        40: 1918600,
      },
    },
  },
  {
    id: 'b-18',
    label: '18 cho (kinh doanh)',
    exactSeats: 18,
    price: {
      label: '18 cho',
      base: 2869000,
      vat: 286900,
      total: 3155900,
      discounts: {
        20: 2598100,
        25: 2454650,
        30: 2311200,
        35: 2167750,
        40: 2024300,
      },
    },
  },
  {
    id: 'b-19',
    label: '19 cho (kinh doanh)',
    exactSeats: 19,
    price: {
      label: '19 cho',
      base: 3041000,
      vat: 304100,
      total: 3345100,
      discounts: {
        20: 2752900,
        25: 2600850,
        30: 2448800,
        35: 2296750,
        40: 2144700,
      },
    },
  },
  {
    id: 'b-20',
    label: '20 cho (kinh doanh)',
    exactSeats: 20,
    price: {
      label: '20 cho',
      base: 3191000,
      vat: 319100,
      total: 3510100,
      discounts: {
        20: 2887900,
        25: 2728350,
        30: 2568800,
        35: 2409250,
        40: 2249700,
      },
    },
  },
  {
    id: 'b-21',
    label: '21 cho (kinh doanh)',
    exactSeats: 21,
    price: {
      label: '21 cho',
      base: 3364000,
      vat: 336400,
      total: 3700400,
      discounts: {
        20: 3043600,
        25: 2875400,
        30: 2707200,
        35: 2539000,
        40: 2370800,
      },
    },
  },
  {
    id: 'b-22',
    label: '22 cho (kinh doanh)',
    exactSeats: 22,
    price: {
      label: '22 cho',
      base: 3515000,
      vat: 351500,
      total: 3866500,
      discounts: {
        20: 3179500,
        25: 3003750,
        30: 2828000,
        35: 2652250,
        40: 2476500,
      },
    },
  },
  {
    id: 'b-23',
    label: '23 cho (kinh doanh)',
    exactSeats: 23,
    price: {
      label: '23 cho',
      base: 3688000,
      vat: 368800,
      total: 4056800,
      discounts: {
        20: 3335200,
        25: 3150800,
        30: 2966400,
        35: 2782000,
        40: 2597600,
      },
    },
  },
  {
    id: 'b-24',
    label: '24 cho (kinh doanh)',
    exactSeats: 24,
    price: {
      label: '24 cho',
      base: 4632000,
      vat: 463200,
      total: 5095200,
      discounts: {
        20: 4184800,
        25: 3953200,
        30: 3721600,
        35: 3490000,
        40: 3258400,
      },
    },
  },
  {
    id: 'b-25',
    label: '25 cho (kinh doanh)',
    exactSeats: 25,
    price: {
      label: '25 cho',
      base: 4813000,
      vat: 481300,
      total: 5294300,
      discounts: {
        20: 4347700,
        25: 4107050,
        30: 3866400,
        35: 3625750,
        40: 3385100,
      },
    },
  },
  {
    id: 'b-29',
    label: '29 cho (kinh doanh)',
    exactSeats: 29,
    price: {
      label: '29 cho',
      base: 4933000,
      vat: 493300,
      total: 5426300,
      discounts: {
        20: 4455700,
        25: 4209050,
        30: 3962400,
        35: 3715750,
        40: 3469100,
      },
    },
  },
  {
    id: 'b-40',
    label: '40 cho (kinh doanh)',
    exactSeats: 40,
    price: {
      label: '40 cho',
      base: 5263000,
      vat: 526300,
      total: 5789300,
      discounts: {
        20: 4752700,
        25: 4489550,
        30: 4226400,
        35: 3963250,
        40: 3700100,
      },
    },
  },
  {
    id: 'b-pickup',
    label: 'Pickup/Minivan (kinh doanh)',
    isPickup: true,
    price: {
      label: 'Pickup/Minivan',
      base: 933000,
      vat: 93300,
      total: 1026300,
      discounts: {
        20: 855700,
        25: 809050,
        30: 762400,
        35: 715750,
        40: 669100,
      },
    },
  },
];

export const truckBands: TruckBand[] = [
  {
    id: 't-under-3',
    label: 'Duoi 3 tan',
    maxTons: 3,
    price: {
      label: 'Duoi 3 tan',
      base: 853000,
      vat: 85300,
      total: 938300,
      discounts: {
        20: 783700,
        25: 741050,
        30: 698400,
        35: 655750,
        40: 613100,
      },
    },
  },
  {
    id: 't-3-8',
    label: 'Tu 3 den 8 tan',
    minTons: 3,
    maxTons: 8,
    price: {
      label: '3 den 8 tan',
      base: 1660000,
      vat: 166000,
      total: 1826000,
      discounts: {
        20: 1510000,
        25: 1427000,
        30: 1344000,
        35: 1261000,
        40: 1178000,
      },
    },
  },
  {
    id: 't-8-15',
    label: 'Tren 8 den 15 tan',
    minTons: 8,
    maxTons: 15,
    price: {
      label: '8 den 15 tan',
      base: 2746000,
      vat: 274600,
      total: 3020600,
      discounts: {
        20: 2487400,
        25: 2350100,
        30: 2212800,
        35: 2075500,
        40: 1938200,
      },
    },
  },
  {
    id: 't-over-15',
    label: 'Tren 15 tan',
    minTons: 15,
    price: {
      label: 'Tren 15 tan',
      base: 3200000,
      vat: 320000,
      total: 3520000,
      discounts: {
        20: 2896000,
        25: 2736000,
        30: 2576000,
        35: 2416000,
        40: 2256000,
      },
    },
  },
  {
    id: 't-tractor',
    label: 'Xe dau keo',
    exactTons: 0,
    price: {
      label: 'Xe dau keo',
      base: 4800000,
      vat: 480000,
      total: 5280000,
      discounts: {
        20: 4336000,
        25: 4096000,
        30: 3856000,
        35: 3616000,
        40: 3376000,
      },
    },
  },
];

export const over25SeatFormulaBase = 4813000;
export const over25SeatFormulaIncrement = 30000;
export const vatRate = 0.1;
