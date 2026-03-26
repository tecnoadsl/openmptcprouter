#!/bin/bash
echo "=== OMR Build Server ==="
echo "Avvio API build su porta 8085..."

cd /home/builder
python3 build.py
