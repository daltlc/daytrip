// @ts-check
/* Daytrip — the friendly class names ("Le Mans" for `lemans`), shared by the day page's badge and
   class link and the garage's chips and count line, so the two pages always name a class alike. */
/** @import { CarClass } from './types.js' */

/** @type {Record<CarClass, string>} */
const CLASS_LABEL = {
  road: 'Road car', exotic: 'Exotic', rally: 'Rally', f1: 'Formula 1', gt3: 'GT3',
  lemans: 'Le Mans', jdm: 'JDM', muscle: 'Muscle', offroad: 'Off-road',
  vintage: 'Vintage', touring: 'Touring car', concept: 'Concept',
};

/**
 * The label for a class, or the raw value for one this map doesn't know.
 * @param {string} cls
 * @returns {string}
 */
export const classLabel = cls => (Object.hasOwn(CLASS_LABEL, cls) ? CLASS_LABEL[/** @type {CarClass} */ (cls)] : cls);
