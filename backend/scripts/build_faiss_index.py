# backend/scripts/build_faiss_index.py
import os
import json
import argparse
import pandas as pd
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

def combine_text(row, cols):
    return " | ".join([f"{c}: {str(row[c])}" for c in cols if pd.notna(row[c])])

def build_index(csv_path, output_dir, model_name="sentence-transformers/all-MiniLM-L6-v2"):
    os.makedirs(output_dir, exist_ok=True)
    print(f"Loading model {model_name}...")
    model = SentenceTransformer(model_name)
    
    print(f"Reading data from {csv_path}")
    df = pd.read_csv(csv_path)
    cols = df.columns.tolist()
    texts = [combine_text(r, cols) for _, r in df.iterrows()]

    print(f"Encoding {len(texts)} rows...")
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=True).astype("float32")

    print("Building FAISS index...")
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)

    faiss.write_index(index, os.path.join(output_dir, "index.faiss"))
    with open(os.path.join(output_dir, "meta.jsonl"), "w", encoding="utf-8") as f:
        for row in df.to_dict(orient="records"):
            f.write(json.dumps(row) + "\n")

    print("✅ Index built successfully!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    parser.add_argument("--out", required=True, help="Output folder for index")
    args = parser.parse_args()
    build_index(args.csv, args.out)
