---
title: "Best Case Methodology (BCM) - New Construction"
module: bcm-new-construction
revision: "1.0"
tags: [sop, construction, bcm, methodology, operations, field, pm]
status: draft
created: 2026-02-23
updated: 2026-02-23
author: Warp
visibility:
  public: false
  internal: true
  roles: [all]
---

<style>
  .bcm-container { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1f2937; }
  .bcm-header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 32px; border-radius: 12px; margin-bottom: 24px; }
  .bcm-header h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
  .bcm-header .subtitle { opacity: 0.9; font-size: 16px; }
  .bcm-meta { display: flex; gap: 24px; margin-top: 16px; font-size: 13px; opacity: 0.8; }
  .bcm-intro { background: #f8fafc; border-left: 4px solid #0d47a1; padding: 16px 20px; margin-bottom: 24px; border-radius: 0 8px 8px 0; }
  .phase { background: white; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .phase-header { background: #f1f5f9; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; }
  .phase-number { background: #0d47a1; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .phase-title { font-size: 18px; font-weight: 600; color: #0f172a; margin: 0; }
  .phase-duration { margin-left: auto; background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .phase-content { padding: 20px; }
  .step { margin-bottom: 16px; padding-left: 20px; border-left: 2px solid #e5e7eb; }
  .step:last-child { margin-bottom: 0; }
  .step-title { font-weight: 600; color: #374151; margin-bottom: 4px; }
  .step-detail { color: #6b7280; font-size: 14px; }
  .substep { margin: 8px 0 8px 16px; padding: 8px 12px; background: #f9fafb; border-radius: 6px; font-size: 13px; }
  .substep-title { font-weight: 500; color: #374151; }
  .principles { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-top: 24px; }
  .principles h3 { color: #065f46; margin: 0 0 12px; font-size: 16px; }
  .principles ul { margin: 0; padding-left: 20px; }
  .principles li { color: #047857; margin-bottom: 6px; font-size: 14px; }
</style>

<div class="bcm-container">

<div class="bcm-header">
  <h1>Best Case Methodology (BCM)</h1>
  <div class="subtitle">Step-by-Step Procedure for New Construction</div>
  <div class="bcm-meta">
    <span>📐 Single-Family Residential</span>
    <span>📏 ~2000 SF Reference</span>
    <span>👷 4-6 Person Core Crew</span>
    <span>⏱️ 4-6 Month Duration</span>
  </div>
</div>

<div class="bcm-intro">
  <strong>Overview:</strong> This BCM outlines optimal conditions for new construction of a typical single-family residential home (slab-on-grade foundation). Assumes favorable weather, skilled crew, efficient supply chain, no permit/inspection delays, and adherence to local building codes. Adjustments can be made for basements or pier foundations.
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">1</div>
    <h2 class="phase-title">Pre-Construction Planning</h2>
    <span class="phase-duration">1-2 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Obtain Permits and Approvals</div>
      <div class="step-detail">Secure building permits, zoning approvals, environmental clearances, and utility locates. Review architectural plans, engineering specs, and site surveys.</div>
    </div>
    <div class="step">
      <div class="step-title">Site Survey and Layout</div>
      <div class="step-detail">Mark property boundaries, building footprint, and elevations using GPS or laser levels. Identify setbacks and easements.</div>
    </div>
    <div class="step">
      <div class="step-title">Budget and Scheduling</div>
      <div class="step-detail">Finalize cost estimates, material procurement, and Gantt chart schedule. Assign subcontractors (e.g., MEP trades).</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">2</div>
    <h2 class="phase-title">Site Preparation</h2>
    <span class="phase-duration">1-2 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Grub and Clear</div>
      <div class="step-detail">Remove vegetation, trees, rocks, and debris using excavators, bulldozers, and chainsaws. Haul away waste to approved dumpsites. Grade the site for proper drainage (slope 1-2% away from foundation).</div>
    </div>
    <div class="step">
      <div class="step-title">Soil Testing and Compaction</div>
      <div class="step-detail">Test soil for bearing capacity (e.g., via cone penetration test). Compact subgrade with vibratory rollers to 95% density.</div>
    </div>
    <div class="step">
      <div class="step-title">Erosion Control</div>
      <div class="step-detail">Install silt fences, straw bales, and temporary drainage swales to prevent runoff.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">3</div>
    <h2 class="phase-title">Utilities and Rough Infrastructure</h2>
    <span class="phase-duration">1-2 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Trench and Install Trunk Services (MEPs)</div>
      <div class="step-detail">Dig trenches (18-36" deep) for water, sewer, electrical, gas, and telecom lines. Install conduits, pipes (e.g., PVC for sewer, copper/PEX for water), and backfill with compacted soil. Coordinate with utilities for meter installations.</div>
    </div>
    <div class="step">
      <div class="step-title">Temporary Utilities</div>
      <div class="step-detail">Set up on-site power, water, and sanitation (e.g., portable generators, water tanks, porta-potties).</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">4</div>
    <h2 class="phase-title">Foundation</h2>
    <span class="phase-duration">2-3 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Layout and Excavation</div>
      <div class="step-detail">Stake out foundation lines using batter boards and string lines. Excavate footings (12-24" deep) and slab area (4-6" deep).</div>
    </div>
    <div class="step">
      <div class="step-title">Install Forms or Piers</div>
      <div class="step-detail">
        <strong>For slab:</strong> Set wooden or aluminum forms with rebar grids (e.g., #4 rebar at 12" OC).<br>
        <strong>For piers:</strong> Drill holes (12-24" diameter, 8-20' deep), insert sonotubes, and place rebar cages.
      </div>
    </div>
    <div class="step">
      <div class="step-title">Plumbing Rough-In</div>
      <div class="step-detail">Install under-slab plumbing (drains, vents) before pour.</div>
    </div>
    <div class="step">
      <div class="step-title">Pour Concrete</div>
      <div class="step-detail">Mix/pump concrete (3000-4000 PSI). Pour footings first, then slab or piers. Use vibrators for consolidation. Level with screeds and bull floats. Install anchor bolts for sill plates.</div>
    </div>
    <div class="step">
      <div class="step-title">Curing</div>
      <div class="step-detail">Cover with plastic sheeting or curing compound. Allow 7 days minimum cure before framing.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">5</div>
    <h2 class="phase-title">Framing</h2>
    <span class="phase-duration">3-4 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Measurement and Layout for Bottom Plates</div>
      <div class="step-detail">Use laser levels to mark sill plate locations on foundation. Ensure squareness (3-4-5 method).</div>
    </div>
    <div class="step">
      <div class="step-title">Install Bottom Plate Sill Seal</div>
      <div class="step-detail">Apply foam gasket or sill sealer to foundation top for moisture barrier.</div>
    </div>
    <div class="step">
      <div class="step-title">Anchor Base Plate</div>
      <div class="step-detail">Drill and epoxy anchor bolts into concrete. Secure treated lumber bottom plates (2x6 or 2x8) with nuts/washers.</div>
    </div>
    <div class="step">
      <div class="step-title">Erect Walls</div>
      <div class="step-detail">Frame exterior and interior walls (2x4 or 2x6 studs at 16" OC). Install headers over openings. Sheathe with OSB/plywood.</div>
    </div>
    <div class="step">
      <div class="step-title">Floor Joists and Subfloor</div>
      <div class="step-detail">If multi-story: Install engineered joists or lumber, then plywood subfloor.</div>
    </div>
    <div class="step">
      <div class="step-title">Roof Framing</div>
      <div class="step-detail">Install trusses or rafters, sheathing, and felt underlayment.</div>
    </div>
    <div class="step">
      <div class="step-title">Framing Inspection</div>
      <div class="step-detail">Verify structural integrity before proceeding.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">6</div>
    <h2 class="phase-title">Rough-Ins</h2>
    <span class="phase-duration">2-3 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Rough Plumbing</div>
      <div class="step-detail">Install supply lines, drains, vents, and fixtures stubs (e.g., PEX tubing crimped to manifolds).</div>
    </div>
    <div class="step">
      <div class="step-title">Rough Electrical</div>
      <div class="step-detail">Run wiring (NM-B cable), install boxes for outlets/switches (per NEC: outlets every 12', GFCI in wet areas). Pull low-voltage for HVAC controls, security.</div>
    </div>
    <div class="step">
      <div class="step-title">Rough HVAC</div>
      <div class="step-detail">Install ductwork, vents, and furnace/AC units.</div>
    </div>
    <div class="step">
      <div class="step-title">Insulation</div>
      <div class="step-detail">Install batts (R-19 walls, R-30 attic) or spray foam. Seal gaps with caulk/foam.</div>
    </div>
    <div class="step">
      <div class="step-title">MEP Inspections</div>
      <div class="step-detail">Pass plumbing, electrical, and mechanical inspections before closing walls.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">7</div>
    <h2 class="phase-title">Exterior Finishes</h2>
    <span class="phase-duration">2-3 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Windows and Doors</div>
      <div class="step-detail">Install pre-hung units, flash with tape, and caulk.</div>
    </div>
    <div class="step">
      <div class="step-title">Siding and Trim</div>
      <div class="step-detail">Apply housewrap, then siding (vinyl, brick, stucco). Add soffits, fascia.</div>
    </div>
    <div class="step">
      <div class="step-title">Roofing</div>
      <div class="step-detail">Install shingles/underlayment, flash valleys/chimneys.</div>
    </div>
    <div class="step">
      <div class="step-title">Exterior Painting/Staining</div>
      <div class="step-detail">Prime and paint trim/siding.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">8</div>
    <h2 class="phase-title">Interior Finishes</h2>
    <span class="phase-duration">4-6 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Drywall (Sheetrock) Installation</div>
      <div class="step-detail">This comes after MEPs, insulation, and inspections.</div>
      <div class="substep">
        <div class="substep-title">Hang Sheetrock</div>
        Measure and cut 1/2" or 5/8" panels (fire-rated in garages). Screw to studs (screws 12" OC on edges, 16" in field). Use lifts for ceilings. Stagger seams, bevel edges.
      </div>
      <div class="substep">
        <div class="substep-title">Tape and Float (Mudding)</div>
        Apply joint tape (paper or mesh) over seams. Spread joint compound (mud) in 3 coats: embedding, filling, skim-coating. Sand between coats (120-220 grit). Feather edges for smooth transitions.
      </div>
      <div class="substep">
        <div class="substep-title">Texture</div>
        Apply knockdown, orange peel, or skip trowel texture using sprayer/hawk. Allow drying, then knock down highs.
      </div>
      <div class="substep">
        <div class="substep-title">Prime and Paint</div>
        Seal with PVA primer. Apply 2 coats of paint (roller for flats, brush for cuts). Use low-VOC paints.
      </div>
    </div>
    <div class="step">
      <div class="step-title">Interior Trim</div>
      <div class="step-detail">Install baseboards, crown molding, door casings. Caulk and paint.</div>
    </div>
    <div class="step">
      <div class="step-title">Flooring</div>
      <div class="step-detail">Install underlayment, then hardwood/carpet/tile. Grout and seal tile.</div>
    </div>
    <div class="step">
      <div class="step-title">Cabinets and Countertops</div>
      <div class="step-detail">Hang cabinets, install granite/quartz tops, backsplashes.</div>
    </div>
    <div class="step">
      <div class="step-title">Fixtures and Appliances</div>
      <div class="step-detail">Install lights, faucets, toilets, appliances.</div>
    </div>
    <div class="step">
      <div class="step-title">Final Painting Touch-Ups</div>
      <div class="step-detail">Address any scuffs or misses.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">9</div>
    <h2 class="phase-title">Mechanical Systems Completion</h2>
    <span class="phase-duration">1-2 Weeks</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">HVAC Startup</div>
      <div class="step-detail">Test ducts, balance air flow, charge refrigerant.</div>
    </div>
    <div class="step">
      <div class="step-title">Electrical Finish</div>
      <div class="step-detail">Install switches, outlets, fixtures. Test GFCIs, smoke detectors.</div>
    </div>
    <div class="step">
      <div class="step-title">Plumbing Finish</div>
      <div class="step-detail">Connect fixtures, test for leaks, install water heater.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">10</div>
    <h2 class="phase-title">Landscaping and Exterior</h2>
    <span class="phase-duration">1 Week</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Grading and Drainage</div>
      <div class="step-detail">Final grade soil, install gutters/downspouts.</div>
    </div>
    <div class="step">
      <div class="step-title">Driveway and Walkways</div>
      <div class="step-detail">Pour concrete or lay pavers.</div>
    </div>
    <div class="step">
      <div class="step-title">Planting</div>
      <div class="step-detail">Sod grass, plant shrubs/trees.</div>
    </div>
  </div>
</div>

<div class="phase">
  <div class="phase-header">
    <div class="phase-number">11</div>
    <h2 class="phase-title">Final Inspections and Punch List Turnover</h2>
    <span class="phase-duration">1 Week</span>
  </div>
  <div class="phase-content">
    <div class="step">
      <div class="step-title">Final Building Inspection</div>
      <div class="step-detail">Verify code compliance (egress, energy efficiency).</div>
    </div>
    <div class="step">
      <div class="step-title">Punch List</div>
      <div class="step-detail">Walkthrough with owner/subcontractors. Fix minor issues (e.g., paint drips, loose hardware).</div>
    </div>
    <div class="step">
      <div class="step-title">Cleanup</div>
      <div class="step-detail">Remove debris, clean interiors/exteriors.</div>
    </div>
    <div class="step">
      <div class="step-title">Turnover</div>
      <div class="step-detail">Hand over keys, warranties, as-built drawings. Conduct owner orientation.</div>
    </div>
  </div>
</div>

<div class="principles">
  <h3>🎯 Key BCM Principles</h3>
  <ul>
    <li><strong>Prefabrication:</strong> Use prefabricated components (e.g., trusses) for speed</li>
    <li><strong>Parallel Work:</strong> Overlap trades where safe (e.g., exteriors during interiors)</li>
    <li><strong>Daily Tracking:</strong> Use tools like Nexus Connect App for progress logging</li>
    <li><strong>Safety First:</strong> PPE, fall protection at all times</li>
    <li><strong>Sustainability:</strong> Energy-efficient materials and practices</li>
  </ul>
</div>

</div>
