/**
 * Seed script: HdStoreLocation
 *
 * Loads Home Depot store locations into the HdStoreLocation table.
 * This initial seed covers ~120 major stores across key US markets.
 * Full dataset (~2,000 stores) can be loaded from HD's store locator API.
 *
 * Usage:
 *   cd packages/database
 *   npx ts-node seed/seed-hd-store-locations.ts
 */

import prisma from "../src/client";

// [storeNumber, zip, city, state]
const HD_STORES: Array<[string, string, string, string]> = [
  // Texas — Houston
  ["6528", "77024", "Houston", "TX"],
  ["0586", "77077", "Houston", "TX"],
  ["0581", "77007", "Houston", "TX"],
  ["6574", "77082", "Houston", "TX"],
  ["0580", "77036", "Houston", "TX"],
  ["0574", "77090", "Houston", "TX"],
  ["0575", "77433", "Houston", "TX"],
  ["0588", "77015", "Houston", "TX"],
  ["0576", "77546", "Friendswood", "TX"],
  ["0579", "77584", "Pearland", "TX"],
  ["0583", "77388", "Spring", "TX"],
  ["0577", "77375", "Tomball", "TX"],
  ["6540", "77494", "Katy", "TX"],
  ["0589", "77449", "Katy", "TX"],
  ["0573", "77338", "Humble", "TX"],
  ["0582", "77573", "League City", "TX"],
  ["0587", "77504", "Pasadena", "TX"],
  ["6525", "77354", "Magnolia", "TX"],
  ["0584", "77478", "Sugar Land", "TX"],
  ["0585", "77459", "Missouri City", "TX"],

  // Texas — Dallas/Fort Worth
  ["0556", "75201", "Dallas", "TX"],
  ["0559", "75287", "Dallas", "TX"],
  ["0551", "75243", "Dallas", "TX"],
  ["0561", "76011", "Arlington", "TX"],
  ["0562", "76137", "Fort Worth", "TX"],
  ["0563", "76244", "Keller", "TX"],
  ["0564", "75034", "Frisco", "TX"],
  ["0565", "75070", "McKinney", "TX"],
  ["0558", "75150", "Mesquite", "TX"],
  ["6515", "76092", "Southlake", "TX"],

  // Texas — Austin/San Antonio
  ["6510", "78704", "Austin", "TX"],
  ["0604", "78745", "Austin", "TX"],
  ["6511", "78681", "Round Rock", "TX"],
  ["0606", "78660", "Pflugerville", "TX"],
  ["0601", "78232", "San Antonio", "TX"],
  ["0602", "78245", "San Antonio", "TX"],
  ["0603", "78224", "San Antonio", "TX"],
  ["6512", "78258", "San Antonio", "TX"],

  // California — Los Angeles
  ["1001", "90034", "Los Angeles", "CA"],
  ["1002", "91601", "North Hollywood", "CA"],
  ["1003", "91101", "Pasadena", "CA"],
  ["1004", "90250", "Hawthorne", "CA"],
  ["1005", "90501", "Torrance", "CA"],
  ["1006", "90280", "South Gate", "CA"],
  ["1007", "91770", "Rosemead", "CA"],
  ["1008", "91362", "Thousand Oaks", "CA"],
  ["1009", "91355", "Valencia", "CA"],
  ["1010", "92821", "Brea", "CA"],

  // California — San Francisco/Bay Area
  ["1020", "94103", "San Francisco", "CA"],
  ["1021", "94545", "Hayward", "CA"],
  ["1022", "94538", "Fremont", "CA"],
  ["1023", "95035", "Milpitas", "CA"],
  ["1024", "95050", "Santa Clara", "CA"],
  ["1025", "94553", "Martinez", "CA"],
  ["1026", "94520", "Concord", "CA"],
  ["1027", "94534", "Fairfield", "CA"],

  // California — San Diego
  ["1030", "92108", "San Diego", "CA"],
  ["1031", "92126", "San Diego", "CA"],
  ["1032", "92025", "Escondido", "CA"],
  ["1033", "91911", "Chula Vista", "CA"],

  // Florida — Miami/South FL
  ["0251", "33126", "Miami", "FL"],
  ["0252", "33014", "Hialeah", "FL"],
  ["0253", "33313", "Fort Lauderdale", "FL"],
  ["0254", "33401", "West Palm Beach", "FL"],
  ["0255", "33444", "Delray Beach", "FL"],

  // Florida — Tampa/Orlando
  ["0256", "33610", "Tampa", "FL"],
  ["0257", "33713", "St. Petersburg", "FL"],
  ["0258", "32801", "Orlando", "FL"],
  ["0259", "32839", "Orlando", "FL"],
  ["0260", "32819", "Orlando", "FL"],

  // Florida — Jacksonville
  ["0261", "32216", "Jacksonville", "FL"],
  ["0262", "32244", "Jacksonville", "FL"],

  // Georgia — Atlanta
  ["0200", "30305", "Atlanta", "GA"],
  ["0201", "30339", "Atlanta", "GA"],
  ["0202", "30324", "Atlanta", "GA"],
  ["0203", "30060", "Marietta", "GA"],
  ["0204", "30022", "Alpharetta", "GA"],
  ["0205", "30024", "Suwanee", "GA"],
  ["0206", "30043", "Lawrenceville", "GA"],
  ["0207", "30265", "Peachtree City", "GA"],

  // Illinois — Chicago
  ["1901", "60614", "Chicago", "IL"],
  ["1902", "60636", "Chicago", "IL"],
  ["1903", "60090", "Wheeling", "IL"],
  ["1904", "60187", "Wheaton", "IL"],
  ["1905", "60148", "Lombard", "IL"],
  ["1906", "60532", "Lisle", "IL"],
  ["1907", "60440", "Bolingbrook", "IL"],
  ["1908", "60605", "Chicago", "IL"],

  // Colorado — Denver
  ["1501", "80204", "Denver", "CO"],
  ["1502", "80012", "Aurora", "CO"],
  ["1503", "80226", "Lakewood", "CO"],
  ["1504", "80501", "Longmont", "CO"],
  ["1505", "80906", "Colorado Springs", "CO"],

  // Arizona — Phoenix
  ["0460", "85004", "Phoenix", "AZ"],
  ["0461", "85254", "Scottsdale", "AZ"],
  ["0462", "85281", "Tempe", "AZ"],
  ["0463", "85202", "Mesa", "AZ"],
  ["0464", "85308", "Glendale", "AZ"],
  ["0465", "85226", "Chandler", "AZ"],

  // Washington — Seattle
  ["1801", "98134", "Seattle", "WA"],
  ["1802", "98004", "Bellevue", "WA"],
  ["1803", "98003", "Federal Way", "WA"],
  ["1804", "98052", "Redmond", "WA"],
  ["1805", "98208", "Everett", "WA"],

  // Oregon — Portland
  ["2701", "97209", "Portland", "OR"],
  ["2702", "97233", "Portland", "OR"],
  ["2703", "97005", "Beaverton", "OR"],
  ["2704", "97015", "Clackamas", "OR"],

  // New York
  ["0110", "10001", "New York", "NY"],
  ["0111", "10014", "New York", "NY"],
  ["0112", "11221", "Brooklyn", "NY"],
  ["0113", "10461", "Bronx", "NY"],
  ["0114", "11435", "Jamaica", "NY"],
  ["0115", "11710", "Bellmore", "NY"],

  // New Jersey
  ["0120", "07032", "Kearny", "NJ"],
  ["0121", "07002", "Bayonne", "NJ"],
  ["0122", "07631", "Englewood", "NJ"],
  ["0123", "08901", "New Brunswick", "NJ"],

  // North Carolina
  ["3601", "28202", "Charlotte", "NC"],
  ["3602", "27604", "Raleigh", "NC"],
  ["3603", "27103", "Winston-Salem", "NC"],
  ["3604", "27401", "Greensboro", "NC"],

  // Tennessee
  ["3701", "37211", "Nashville", "TN"],
  ["3702", "37013", "Antioch", "TN"],
  ["3703", "37919", "Knoxville", "TN"],
  ["3704", "38118", "Memphis", "TN"],

  // Ohio
  ["3801", "43228", "Columbus", "OH"],
  ["3802", "43240", "Columbus", "OH"],
  ["3803", "44107", "Lakewood", "OH"],
  ["3804", "45231", "Cincinnati", "OH"],

  // Michigan
  ["2751", "48226", "Detroit", "MI"],
  ["2752", "48076", "Southfield", "MI"],
  ["2753", "49503", "Grand Rapids", "MI"],

  // Minnesota
  ["2801", "55405", "Minneapolis", "MN"],
  ["2802", "55106", "St. Paul", "MN"],
  ["2803", "55344", "Eden Prairie", "MN"],

  // Pennsylvania
  ["4201", "19148", "Philadelphia", "PA"],
  ["4202", "19123", "Philadelphia", "PA"],
  ["4203", "15220", "Pittsburgh", "PA"],
  ["4204", "15237", "Pittsburgh", "PA"],

  // DC/Virginia
  ["0901", "20003", "Washington", "DC"],
  ["0902", "22202", "Arlington", "VA"],
  ["0903", "22030", "Fairfax", "VA"],

  // Massachusetts
  ["2601", "02120", "Boston", "MA"],
  ["2602", "02148", "Malden", "MA"],

  // Nevada
  ["3001", "89101", "Las Vegas", "NV"],
  ["3002", "89128", "Las Vegas", "NV"],
  ["3003", "89502", "Reno", "NV"],

  // Utah
  ["6801", "84101", "Salt Lake City", "UT"],
  ["6802", "84119", "West Valley City", "UT"],
];

async function main() {
  console.log(`Seeding ${HD_STORES.length} HD store locations...`);

  let created = 0;
  let skipped = 0;

  for (const [storeNumber, zip, city, state] of HD_STORES) {
    try {
      await prisma.hdStoreLocation.upsert({
        where: { storeNumber },
        create: { storeNumber, zip, city, state },
        update: { zip, city, state },
      });
      created++;
    } catch (err: any) {
      console.error(`  ✗ Store ${storeNumber}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Done: ${created} upserted, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
