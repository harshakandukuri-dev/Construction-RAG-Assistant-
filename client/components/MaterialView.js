"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icons";
import { FitResult, Meter, Quality } from "./Bits";
import { api, postFiles } from "@/lib/api";
import { cap, fileUrl, inr, priceRange } from "@/lib/format";

const SETTING = { interior: "Interior", exterior: "Exterior", both: "Interior and exterior" };

// Everything about one material, plus a check of how well it suits a design.
export default function MaterialView({ material, designs, fixedDesign, canManage, onChanged, onEdit, onDelete, onAdd }) {
  const [photo, setPhoto] = useState(0);
  const [chosenDesign, setChosenDesign] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fitState, setFitState] = useState({ key: "", data: null, error: "" });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  const designId = fixedDesign?._id || chosenDesign || designs?.[0]?._id || "";
  const key = `${material._id}|${designId}|${size}|${quantity}`;
  const image = material.images?.[Math.min(photo, material.images.length - 1)];

  useEffect(() => {
    if (!designId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ designId });
      if (size) query.set("size", size);
      if (Number(quantity) > 0) query.set("quantity", quantity);
      api(`/materials/${material._id}/fit?${query}`)
        .then((data) => !cancelled && setFitState({ key, data, error: "" }))
        .catch((err) => !cancelled && setFitState({ key, data: null, error: err.message }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, designId, size, quantity, material._id]);
  const fit = fitState.key === key ? fitState.data : null;

  async function addPhotos(files) {
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const updated = await postFiles(`/materials/${material._id}/images`, files, "images");
      onChanged(updated);
      setPhoto(updated.images.length - 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto() {
    try {
      onChanged(await api(`/materials/${material._id}/images/${image._id}`, { method: "DELETE" }));
      setPhoto(0);
    } catch (err) {
      setError(err.message);
    }
  }

  const areaUnit = material.unit === "sq ft" || material.unit === "sq m";

  return (
    <div className="sheet-body">
      <div>
        <div className="gallery-main" style={{ "--swatch": material.swatch }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image ? <img src={fileUrl(image.url)} alt={image.name || material.name} /> : <span>No photo yet</span>}
        </div>
        {(material.images?.length > 1 || canManage) && (
          <div className="thumbs">
            {material.images.map((img, i) => (
              <button key={img._id} type="button" className="thumb" aria-current={i === photo} aria-label={`Photo ${i + 1}`} onClick={() => setPhoto(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(img.url)} alt="" />
              </button>
            ))}
            {canManage && (
              <>
                <button type="button" className="btn btn-quiet btn-small" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  <Icon name="upload" size={15} /> {uploading ? "Uploading…" : "Add photos"}
                </button>
                {image && (
                  <button type="button" className="btn btn-quiet btn-small" onClick={removePhoto}>
                    Remove this photo
                  </button>
                )}
                <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => addPhotos(Array.from(e.target.files))} />
              </>
            )}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>

      <div>
        <p className="detail-cat">{material.category}</p>
        <h2 className="detail-name">{material.name}</h2>
        {(material.brand || material.model) && <p className="detail-sub">{[material.brand, material.model].filter(Boolean).join(", ")}</p>}
      </div>

      <div className="facts">
        <div>
          <div className="fact-label">Price</div>
          <div className="fact-value">{priceRange(material)}</div>
          <div className="comp-hint">per {material.unit}</div>
        </div>
        <div>
          <div className="fact-label">Quality</div>
          <div className="fact-value">
            <Quality value={material.quality} />
          </div>
          {material.lifespanYears && <div className="comp-hint">Lasts about {material.lifespanYears} years</div>}
        </div>
        <div>
          <div className="fact-label">Used</div>
          <div className="fact-value">{SETTING[material.domain]}</div>
        </div>
        {material.sizes?.length > 0 && (
          <div>
            <div className="fact-label">Sizes</div>
            <div className="fact-value">{material.sizes.join(", ")}</div>
          </div>
        )}
        {material.styles?.length > 0 && (
          <div className="fact-wide">
            <div className="fact-label">Styles</div>
            <div className="tags">
              {material.styles.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="section-title">How it performs</h3>
        <Meter label="Durability" value={material.durability} />
        <Meter label="Water resistance" value={material.waterResistance} />
        <Meter label="Weather resistance" value={material.weatherResistance} />
        <Meter label="Ease of upkeep" value={material.easeOfUpkeep} />
      </div>

      {material.about && (
        <div>
          <h3 className="section-title">About</h3>
          <p className="about">{material.about}</p>
        </div>
      )}

      {[material.pros, material.cons, material.bestFor, material.notFor].some((l) => l?.length) && (
        <div className="twocol">
          {[
            ["Strengths", material.pros],
            ["Watch out for", material.cons],
            ["Best for", material.bestFor],
            ["Not suited for", material.notFor],
          ]
            .filter(([, list]) => list?.length)
            .map(([title, list]) => (
              <div key={title}>
                <h4>{title}</h4>
                <ul>
                  {list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      <div>
        <h3 className="section-title">{fixedDesign ? `Will it fit ${fixedDesign.name}?` : "Will it fit your design?"}</h3>
        {!designId ? (
          <p className="about">
            Create a design with its setting, style, size and budget, and this page will tell you whether the material suits it.{" "}
            <Link href="/designs" className="link" style={{ fontSize: "inherit" }}>
              Go to designs
            </Link>
          </p>
        ) : (
          <>
            <div className="fit-controls">
              {!fixedDesign && (
                <select className="field field-select" aria-label="Design" value={designId} onChange={(e) => setChosenDesign(e.target.value)}>
                  {designs.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {material.sizes?.length > 0 && (
                <select className="field field-select" aria-label="Size" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">Any size</option>
                  {material.sizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <input
                className="field"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                aria-label={`Quantity in ${material.unit}`}
                placeholder={`Quantity (${material.unit})`}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {areaUnit && <p className="comp-hint" style={{ margin: "-6px 0 14px" }}>Leave the quantity empty to use the design&apos;s area.</p>}
            {fitState.key === key && fitState.error && (
              <p className="form-error" role="alert">
                {fitState.error}
              </p>
            )}
            {fit ? <FitResult fit={fit} /> : !fitState.error && <div className="skeleton" />}
            {fit?.cost && (
              <p className="comp-hint" style={{ marginTop: 10 }}>
                Estimated cost {inr(fit.cost.min)} to {inr(fit.cost.max)}
              </p>
            )}
          </>
        )}
      </div>

      {onAdd && (
        <button type="button" className="btn" onClick={() => onAdd({ size, quantity })}>
          Add to {fixedDesign.name}
        </button>
      )}
      {canManage && (onEdit || onDelete) && (
        <div className="drop-row" style={{ justifyContent: "flex-start", margin: 0 }}>
          {onEdit && (
            <button type="button" className="btn btn-quiet btn-small" onClick={onEdit}>
              Edit details
            </button>
          )}
          {onDelete && (
            <button type="button" className="link link-danger" style={{ fontSize: 15 }} onClick={onDelete}>
              Delete material
            </button>
          )}
        </div>
      )}
      <p className="comp-hint">{cap(material.quality)} grade, priced per {material.unit}. {material.sample && "Sample figures: confirm real prices with your supplier."}</p>
    </div>
  );
}
