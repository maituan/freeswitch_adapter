import {
  businessBands,
  nonBusinessBands,
  over25SeatFormulaBase,
  over25SeatFormulaIncrement,
  truckBands,
  vatRate,
  type DiscountRate,
  type PriceRow,
} from './pricingData';

function matchBandBySeats(seats: number, isPickup: boolean, bands: typeof nonBusinessBands) {
  if (isPickup) return bands.find((b) => b.isPickup);
  return bands.find((b) => {
    if (typeof b.exactSeats === 'number') return b.exactSeats === seats;
    if (typeof b.minSeats === 'number' && seats < b.minSeats) return false;
    if (typeof b.maxSeats === 'number' && seats > b.maxSeats) return false;
    return true;
  });
}

function matchBusinessBand(seats: number, isPickup: boolean) {
  if (isPickup) return businessBands.find((b) => b.isPickup);
  const exact = businessBands.find((b) => b.exactSeats === seats);
  if (exact) return exact;
  return businessBands.find((b) => {
    if (typeof b.exactSeats === 'number') return false;
    if (typeof b.minSeats === 'number' && seats < b.minSeats) return false;
    if (typeof b.maxSeats === 'number' && seats > b.maxSeats) return false;
    return true;
  });
}

function matchTruckBand(weightTons: number, isTractor: boolean) {
  if (isTractor) return truckBands.find((b) => b.id === 't-tractor');
  return truckBands.find((b) => {
    if (typeof b.exactTons === 'number' && b.id !== 't-tractor') return b.exactTons === weightTons;
    if (typeof b.minTons === 'number' && weightTons < b.minTons) return false;
    if (typeof b.maxTons === 'number' && weightTons > b.maxTons) return false;
    return true;
  });
}

function buildDiscountedPrice(base: number, discount: DiscountRate): PriceRow {
  const discountedBase = Math.round(base * (1 - discount / 100));
  const vat = Math.round(discountedBase * vatRate);
  const total = discountedBase + vat;
  return {
    label: `Chiet khau ${discount}%`,
    base: discountedBase,
    vat,
    total,
    discounts: {
      20: total,
      25: total,
      30: total,
      35: total,
      40: total,
    },
  };
}

function computeOver25SeatPrice(seats: number, discount?: DiscountRate) {
  const base = over25SeatFormulaBase + over25SeatFormulaIncrement * (seats - 25);
  const vat = Math.round(base * vatRate);
  const total = base + vat;
  const discounts: Record<DiscountRate, number> = {
    20: buildDiscountedPrice(base, 20).total,
    25: buildDiscountedPrice(base, 25).total,
    30: buildDiscountedPrice(base, 30).total,
    35: buildDiscountedPrice(base, 35).total,
    40: buildDiscountedPrice(base, 40).total,
  };
  const discountedTotal = discount ? discounts[discount] : undefined;
  return { base, vat, total, discounts, discountedTotal };
}

export function calculateTndsFee(args: {
  vehicleType: 'car' | 'pickup' | 'truck';
  seats?: number;
  isBusiness?: boolean;
  weightTons?: number;
  isTractor?: boolean;
  discountPercent?: DiscountRate;
  durationYears?: number;
}) {
  const { vehicleType, seats, isBusiness, weightTons, isTractor, discountPercent, durationYears } = args;
  const years =
    typeof durationYears === 'number' && Number.isFinite(durationYears) && durationYears > 0
      ? Math.floor(durationYears)
      : 1;

  const missing: string[] = [];
  if (vehicleType === 'truck') {
    if (!isTractor && (typeof weightTons !== 'number' || weightTons <= 0)) {
      missing.push('weightTons');
    }
  } else {
    if (typeof seats !== 'number' || seats <= 0) missing.push('seats');
    if (typeof isBusiness !== 'boolean') missing.push('isBusiness');
  }

  if (missing.length > 0) return { ok: false, needMoreInfo: true, missing };

  if (vehicleType === 'truck') {
    const band = matchTruckBand(weightTons || 0, Boolean(isTractor));
    if (!band) return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
    const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
    return {
      ok: true,
      group: `Xe tai - ${band.label}`,
      price: band.price,
      discountedTotal,
      durationYears: years,
      periodListTotal: band.price.total * years,
      periodDiscountedTotal: typeof discountedTotal === 'number' ? discountedTotal * years : undefined,
      periodSavings: typeof discountedTotal === 'number' ? (band.price.total - discountedTotal) * years : undefined,
    };
  }

  const isPickup = vehicleType === 'pickup';
  if (isBusiness) {
    const band = matchBusinessBand(seats || 0, isPickup);
    if (!band) {
      if ((seats || 0) > 25) {
        const computed = computeOver25SeatPrice(seats || 0, discountPercent);
        return {
          ok: true,
          group: 'Xe kinh doanh tren 25 cho',
          price: {
            label: `Tren 25 cho (${seats})`,
            base: computed.base,
            vat: computed.vat,
            total: computed.total,
            discounts: computed.discounts,
          },
          discountedTotal: computed.discountedTotal,
          durationYears: years,
          periodListTotal: computed.total * years,
          periodDiscountedTotal:
            typeof computed.discountedTotal === 'number' ? computed.discountedTotal * years : undefined,
          periodSavings:
            typeof computed.discountedTotal === 'number' ? (computed.total - computed.discountedTotal) * years : undefined,
        };
      }
      return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
    }

    const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
    return {
      ok: true,
      group: `Xe kinh doanh - ${band.label}`,
      price: band.price,
      discountedTotal,
      durationYears: years,
      periodListTotal: band.price.total * years,
      periodDiscountedTotal: typeof discountedTotal === 'number' ? discountedTotal * years : undefined,
      periodSavings: typeof discountedTotal === 'number' ? (band.price.total - discountedTotal) * years : undefined,
    };
  }

  const band = matchBandBySeats(seats || 0, isPickup, nonBusinessBands);
  if (!band) return { ok: false, error: 'Khong tim thay bang phi phu hop.' };
  const discountedTotal = discountPercent ? band.price.discounts[discountPercent] : undefined;
  return {
    ok: true,
    group: `Xe khong kinh doanh - ${band.label}`,
    price: band.price,
    discountedTotal,
    durationYears: years,
    periodListTotal: band.price.total * years,
    periodDiscountedTotal: typeof discountedTotal === 'number' ? discountedTotal * years : undefined,
    periodSavings: typeof discountedTotal === 'number' ? (band.price.total - discountedTotal) * years : undefined,
  };
}
