/**
 * ============================================================================
 * WORKER: smd-token-cron
 * ============================================================================
 * Standalone background daemon to refresh Google Drive Service Account tokens
 * every 45 minutes and persist them directly into Cloudflare KV (SA_TOKENS).
 * ============================================================================
 */

const TOKEN_EXPIRATION_TTL_SEC = 3600; // 1 Hour TTL
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Fallback Embedded Service Account Pool
const FALLBACK_SA_POOL = [
  {
    "email": "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDTPOFNebPYbkyI\ntsdb9eUl1x+BwbURoSWV//HW6uau8W5HNILnvhTuei5khz/MYncKjxCNAGoxym2r\nyBlAugfoXmEd1X7sZB5S/rcOVgWbH7B00j7aviPxpXwsxfVBnWq89MVBp2PqIQS+\ngmO1YsWYyuITJItIS088l+tEk6shoU3/Rws4EVswQA7XL/MfNySfzPsElxFtHOHR\nCgYfpx956YiZEgy1y8NeBJZqX+QKRY2AglNlaxWNBtCxCSlXYhh6Dz3+ovbz9NVE\nJfJoPrB382TDYUP23bcvBTGwCAV78j2Zd0UbBD1rzqV96eomYJyKO9V3xcspOkDn\nX+Bjp8aTAgMBAAECggEAFUznySizBmmE5SpNKww+GZU6M5rlV8xAnoILEGlqboyg\n2qREaPrlYHDImdF7kPAC4fkwKY+3paKscWyBg2He50MRFvGO1WZ5GlReAB+TfCNz\nZyxGM0eGF1lhDqC9jOrDNx+VfnvTGupOcKl0RXeaxj/7EQQX2WfiqxEEo8siMAdF\nby/2tOJRSUXPFZRMIi8XO7nUo8rL6+8G5e3bVRseIKDbuvMSKEiz7M3892Cd9ECX\nqQPwHFagTpC4lECcLTRmfnCAlhh+qkbuVVncc7W4/FoeN7rfjCpIFAQ77Gi5zjOk\nOzZcNo5VeSoD9ySpCurk5KZpx4oH9/pVNEWBLoRQFQKBgQD6kqergxUDZ6YB4DSc\n9nQtrf+Cr4tNcHNVb57uM6EtuPzu8IDOt/3/Fky9TRngtwjUvO5LgNhWRDt/UKfh\nEARVV8A3x5Shn9z2HsVW0m/OOdznjXC0kc20qhuITx+g9PUpi8QRwS/YiyZtiXsZ\nHZ2XVxeF9GS3AvPWWoOOeBBObQKBgQDX0CAB6KlINRpqHVZEB9Nan96KEcen6ZED\nrQZnPUwl3bUERdnuCrV9QPY0rUJlw3CiT6aorv1KWKgFoBi/inUdEgn0FPaiismd\n3I/RT+EaN03/eRubTiLim15hq0JzQCOMOXN1yi/4Mr5LUVJbNaldHSpgNgvQ61y9\n2ixuledI/wKBgGPqmOt+YKGz8fFriu9QIzGX4XwmLcEaZxMZaGGJuuq1ij5pLqO/\noIvYQ490sC34LpBOKiN3ZEy59pOlANxw+5lgXWigr/bm/UAzMvOVBDpSvnCi6N9I\nCKPS9Rmcm3seUqhXcD64LzEFA7TIDosMUSvo8ZtbwdFsXvkJrM3huHbdAoGAbcFp\nJc9fmFt5bZIx9zNLqAE6OlnEgn7kw0vRv9uKyI8yqlOj+83ycxsAm9WpuPtmYwXD\nKnKkWpUwDnxXWcJewUQVT88Bh7SxyNkNQ1QulRifUFgVVCyuzTRbEaz5hIeQDJaD\nQ9pp/v4/jSp0ifKGidZ1YKzb4YpxhhRZGHygPZ0CgYAJR20OerO+ZSM2rlqMERgm\ngwTKB9qvryuVjIdi7pgF51s0Td2/sWphjWap+0yGf0H2udfcLM+aUYiCYl/22tWz\nOa+braSl7wHBhDaG+NhdXvfc+vN9pz4CtD48FzIK9mPaQPcX94TfDxffkCVlL8NE\n7V/qeOtm+f4whn1F/B8ZQA==\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-12@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1rV76HSeXxkqt\nD4oo5ldl7qRsLkF4O//sreR7GwHxbv2XBO9SOlv1ZuFvtBZALTjBV+P3wQY9N+rI\nGICBCNbIOx4SrXYtUIYPWBJ4tZ6x/4faHPGFs33JjBsyAECqik/CFlH0+eQXfi4c\nzX0JV6Ijh3CrcrYQDAN5m6r07qFQIrg55HLfLKr7iJpyJi4nqpIRFTieRu1BVs/5\n0lNIa/0Kwl+FcwkMZUcNI8PBvWH/9kkqH+IjnTBCEBk++Sl7ezvJxDl/7ixPZMcW\nDsLU2GpfU7Sjee+JK8QTOJZIOwWnsQ7m8sa6lL6oJ1EGXepJ9FBM+bwk393f+RxM\npFhNbIYHAgMBAAECggEALTQqjhwD9nEpsn7L1xpdA6lJsvsdYh+3sXmhAHp7VMnT\ngiiBrZmEuP40uHj8ElLOLNlECSi3dzL7EXd7Pd/npSGEfYw4e9TtzlKRIgS6rDpS\n4JPUCnrbIPNh7uJ+NJC+gKHSGZy1wpysN5Fve4wY9TMldxtPLpX2pWL0ugXIEGpv\ntF17vyzG9J+kExrkIPrYMNFTfJMzy821SbJgAX94ZaxAsYN4eJy5s04suJ1zP5PE\n+XL+9Bgmrau/hr17UCxf+zy+z2wbXtLhB1TOj9M4dvQaKx4gxVCAOYl+2TQrb8uJ\nMXdo9IJf94IzhH+/SQNiTeqJWca5RAkNK2swcJKGXQKBgQDhbWs6lCZInKmXFrne\nkuQ/2g4dlOv103SZre5n25Zg03OPAitZwNKaq+pBdEaqoW4XKJh6YYYhB7jEtP45\nyYboMdIstYQJZ33v8iZgfSMb4IK10cG6zMPbW9dIyQ2kuotWdZov/Rf6SsiI7+1u\njqIY6fT0j9H0x6oHLBZf/nB7gwKBgQDOUP7xxwBqn0KZJ9X6mmM5iH2vaWyLOtZh\nmra34OxIFtztIuBKJsNQB0UUNPxjyTVNa9pGf3PynmjM58h+ZiPEbCAUVuKRkjAM\nYYmsFHjCBAIDsL0VFk+xPAsRh8O0Zl6fZQE7RQuZa9Wf5PeEHG0gtFnnmJHeuLYM\n/tOxTfTwLQKBgQCjjdy3opdoJWoR+eYfK1o5TX7iTZMpRyMZAQ2xAqvHUoNMJdnI\nA9OJbuPGW5ON5xPV75k5aZqESnLvHRY6XRHpU4RW9dd3b0P7HChl50Tay/hp7Gbv\nnfMYKzk2UND6THId57NXz/xel3WJjPIqPYg0JUKZUeOWAmtFSuJtAVEg+wKBgCqM\nsceTTxauOcH0YUEJziTzbVhb2bLtM4F1svFBRfmoHXAanT8tt2It3aVJODQsLv4E\nnEOlzXfgC6UWuFa5Ie9EjWkkch2rlJU5GHeQ0UbSJMg2DwjmTRE0XOQEp+vwoNsm\nrZZXqwi9IJWVVya75hW0nEYTRSI13fXYKDiM51MRAoGBAKzL9fXjlSTIhZeE4pNI\nwx5IxAwKRtWIPZWK3N4OhpL/ge39G2nANBZutno1na5cPd/4MGECDl5K2+DHqSAZ\nR++cDH+G40KAI2yhOo9nEWEw957tCd7OABJD4BwdzNOsroMdxmBDHXaUZdCELYTC\n+UgLMIE6w9DvQi46nwAUugw/\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-13@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC+590YFk8S1P1T\nNKaHX15KWyMjLXKGsr2SjIXE8IxZpzfQPWDp4uSJPSMGpDcDsbVfipEAG9ZABjbC\nPaS/IF2+5sIgPF8XAxIvCsxwPkOU26Lfa1OuEfToz6CZWjyun0/Ta/znipgGPAHi\nBObTlyKLKZKGkbHSfRVxjMLoCflRupCQrWIEbyAovp47YBFqQsojoAgZ2YJzP/9M\nfYD1tW/3kceI6FPAzHuQwfeKgjqi2FxilfigOfAbNG0ddCRQYAH8i1SEzA+1U0TY\nPvKeSMGtk68FxEr556Aq04BuK+ugdpvMIh5mj0TjIJe9G3xrqN18MH6oWLPa46C8\naNO5fP3pAgMBAAECggEAMKmGzKiHIHxFVKvTlSdEsDx6APIJQveV5iDGynQsun+q\n9PxoU0YgTjFU19ENKvZmDsQSAQ6Xdvt+gtXWxFdaPhqxOilZbdK9FFuy0Bu2+19f\nLYc8rd7q6Ftgiyaa2EJIxVI+BcFozhIGwtfQBPh9+C4xKPdDdi2nRSoF1sMQF/o+\nopsyZaQwpajsLJK3aIAmW9rt5CdSmfKICceECyzuKxcmOUNfTpwITIt8NR3i/Y8Y\n/4DyyaU+E3y5/FcxiAsI6vcD5znsbTUYHJ4AAzD6N1Z3Jz1rv5bR1ujXNGTpVSGg\neSwhizY0+Rnr4oMihN1MVd8jqN3pQuQCcJZvC6JlfwKBgQD1lUXiC7GZMv251lvJ\nGHOz3eKhhn0x4vl91ZVvrtY8GjdbiGt6m7HdiBmoKz5t6Z0GzX772rwFXd+kY/94\nauJNAOtKtJQpUinn3UcNKWd7YOb0k4FqnLxKbtu/2g6mgozVoMD9V8mtL8IWwLHL\nQoGRDFA0IMyJjjBmj1Ht3DdPZwKBgQDHANzA8QP73w6gj8nb4awqQ0yCr9CFx9y8\n12Mvgj0U5Nl+aGCU3DN7fd5ey2JLHIwTv2anZ/G6Fs4bX/9XzP6AJwRUh+nQCuK6\niCwemRGGSfeaWqcskk4jMPNgG8lEMl0z5vJ6DFyx6HwaWkA5WQeHO9XRBeckw05V\nroctTh8GLwKBgFJ7/KjbvJ70HXxZnyJ/7/ytvfz6qvoifiHhpvuIAbTWKVm5DEB2\nItuBZvyw6ZsJKBCs3MXCxfwXd5JDc/8CB1hNwrmoxUrLqf+SttaY3YT3Gxtyn7kr\nQ6LMcUqS9vC+UIdAIxH0dmyQ6eOyfQUEJXiOZjHcAlcBRwhrgt0dZgZpAoGBAIMZ\n31TAsxYwmetPLvXLk2d4VKRX/TDVPWevIem/jEwChAJR8ya+drApeODMbmH7WZD8\n7DznLomg0oGYWZjXNObqTWD+9RsYwMuQQDicML5eZl9qz21+qTln2z36sDpcT6iM\nwjuDf2G5PmECCgN90obV9YOxttgyTp4Fz4oaSDgDAoGBAPDLCYxuyKk3Qpn0ThJZ\nc/DJWJZGNxZCerkRyEtnrhbgDDSqKhM4roIE1GPKw2HyStHAXplMqgRc5+DsROLT\nCMSu8bubhVR9sayZWocO4M5t4Hi9oe16iXwszzFsYZ/Q0wJWHwTdV/acXQqVqQaN\ns0gOAAJ3qysMaEtPTaknXgnK\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-14@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDWtiiToCJGEJln\n/NXsm1aAwzn3CvFn46ngkcU9sEV0ReZoSZXPpq5TnqxNYnUgai8Ae3prIxWGlB7X\ntNjlCdfljLkol8i1h0Tm/0f53G3R3rUBGdazl7VAksQXgXllMgS5VZpR3nDlMcoF\nD7NJFLzsTRiP1z8i6bekfYtSNbpuLspbHk6lartgpalK5pOPWBUMpcj+b32/t/E9\nV20DlGW4YFCSQS+hDbimojV2MJGaZoGFPVuQ8jPrCftREAy//992yoGL15lmtSR2\n9SzDjLjLO0S3mz0ke7D+ivPIpCe8JWt1fqPJ+EW7eoLc/Xte1Gl9nYsr4eGzqCwe\nGM8q1kvHAgMBAAECggEAIkK/18qaHXcBm5O/KPmihHpicfanja3IyiJIiG7rrkGH\nIgX350IQGBy+Hr0CtpDq/hc18gmPokFZaI8devKmpiTd2Mnbh4fVqUx71jVjurTg\nShQu68pd7DdfHecVkV25Xj94F+84MYJP253lPFiYStaEgFNW6kHEAXXc+NnE7Va0\nNiL4IgLshJzsxIaHEWMULNs1b4MTfHc+H+JY45ONw+hWyGZ2R470TwmKEpQf294q\ndK8998v86bKMEQt/ntWiU+qWmqUCYlplpiyYYBS0Zc1P2Axe5LPBdxjEW2oA8QDa\nMalUDmYwfsGW0s3SiXaJ2OJdsKtZGZ6nxk9k9bUoQQKBgQDq/OsmUzyPjy+flEC5\naUJTf4he8Y4lcERkLe8TZiW3wJYfr2vtzXH29zm3IrwPHr3Clv0X5QQ2EnJhIOLN\n2IkdS7TH2xBnNa/aNvL2AbSMAEbtfgOaNPyrd3UGyRsrTqd21HbGGeA8LRyad6Ah\n79Se7xH1jHZDmu0QBhE7uJdsBwKBgQDp6RhbhYBZlS4uAZ98LAew1TxmGocQCDJV\nf+gE3fBLAiFMa5Wz2qcnwUICFkAM7hpNARVlZFOdhlo8kwNnwNDgtLa0oTS+V9Ou\nYkZUEVdl9BmrUTwbZmeBIYlpVxEfgeazafM5VedGku4ni3n7jtJGduRu1U/vsHn1\nbbF/XsGyQQKBgCcciZcLa50JXAfXiR5TIrL7GxuSYPJiST/TVWOJMOXwrAwCCpi+\nBSXx6C1PHrX1i+gDcYS0nYrSby8zZgyU6d1yaFiLYaOMEATl+HJxvjc/JI8K1lao\nUxXHADds6ZS/tqfUnSBD1kqtx4D+QCzl2iHJ8NdJ1bVS5/ouyFeEVc+pAoGAAoQo\nZ+uiutP5ADOyRIKwvn08vhhw9YIxEGxk0ZCVoijutMS/goTKoYnZrO4SWFFDZSqq\n0UFoCNzGIbqvIbGYTaKECKNnTtjhBRI3kXXyS715fTdNfzn1yRTURpbSL1WVZr6w\nCCDdcQvplfFRKZyatHlY8bxHtNtgJHy+mREq4kECgYEAkh2lbBLCDFIb4FiQIPhk\nJh1c+/6oXzZSRxv3m9B6gRswwjib6hbMLtmrcOOqIY+9HExHosFChck2NxsHLvxj\neSyCsPlhEkT4332wwXv3KbToOMlhuiCNKuf9VWm/haBTacm2rI0EpShNpNCYIxbi\nXrjDMLpJNQVshav7QJ2nCY8=\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-15@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDVqPPq4f4L0WCD\n4ogaoP0BPoy+nC7qzwlzoEuKW0WhPXr+Xj8k/0esCaCzy3kxZJ1iqGYjlMLJPXOe\nGbPclwPxOC1PAP9M3c2hgWO59wvuIKIXsd4pPBisusJycjLI9ClT6v6oxkwDmt49\nk7ir27Pouk0Ni9vihSOeaqaRy7XT5OjiYCK9A4vn0WhYrGqENo8+r6nIdCzVMetB\nCscN+7B4HzQ42yih22579g9kVxQ1HfEIJPKSdbF436762/VxVVM6XmGtwiw950Xf\n7l377ZUQGcDdOOPPilO2DLz0qN+0E/DWRVxd6r5DgXO3j8lsTnz4HIdrl76NEHr0\n5PHCGDvPAgMBAAECggEAIwsT/plUbqHHv7ne8ucmuBaHRRgexdpxRWqsGSRBNmH8\nE05n8ux/1+K4XeTomsZS3gSaxAk5LYKLvQmgK3UFa4H4RHX4aaYTfQLY1X6EkWj+\nzP4aXw8BSQtUqyq506XgRWhMnmfvvcOf4d+hsWZWirxLuQYQaYXGwsvhSBZuWzNq\nmuf7DN04WimgUeLWauXqtskjXXMOFWC9OoNYUMQ2c2X8Y4G0ox/Cil1na914te1l\nLJd64fqnAerU2M7egz6HworBtkduqD7hWf2bbrEwJOiUAnFpWLRYZcrsXgjeetWY\nb/LTzuRQZwwAsxz2Zltuu23rxTMpyGQCNh/saegvWQKBgQDq2bKhAb245uSu8AUG\nBugFllN6KPZYSXBiTYHlHSJ9uYk2ZaQqVI2jI36e6dwO/LxfztbFFBKmu0xXbAD8\nIrs0CDeXhAgpagKMcYtAT5Q76idZyNVrFMvMQ/YgMS68/+LCcBpy2nZqgltv1VtT\nAPowXdotG0Kf+/Xbt3g6tOh7LQKBgQDo5rnMBJKOBdrsDbhRj9oDsuPvQfqvjJHp\neOQ+2FQ6NUySQm8f6R+lhcQoBfNZizYTmAfQPhILIcAM81exBbMg9OJP6etuXYnB\nlFPKwxQkcNTfX+ZMgAVbHtfaWmsYZgaRUYlZXGSZ+tJUyM0Wk0v8Oe5ZMQolggiH\n/f++RZfAawKBgDdloKgwA/OwqzLEtTqluGdQ/WHsdad/sz3M8J390Fv9vusQ8Ld3\neG2J+t07Zsg2P60N2kVkpb2koq5gcJ8JBkWQxqQ75bz3H6DHS8SgwOOdKSkZoZX/\nss79HPqc/1xfs7qPvP1ooNQg6baoikE7EskD6moHayDXyzfHwFmAwPIFAoGAN4t/\nWEbm5PREh/Olt94E8sjhT5h+vwtZaUMpvEs/mzpG7sLlWcjxgTpr09fHd92Zogaq\nJmIHT5xW/z+x9EgVtpBwwPpa6dFpHz/O1Ba+YQp/2l42wJvvqxGqDStvSzxZ6KJ3\njVZZr9d//jR9pRqwDpGKZL8rWlKu0jAjpC9Yx80CgYA1S5gQXTYEPLvNFUYNNVHS\nGSnl4V+7hm0XdW12l8Y7++P4JnaykEsAa97V+EXMpjZR7L7erJK1ezKeN07Gw0eX\nK6YNyr9O4tMkg67eg/gq5fKnfUym/6aPvAAFNnP/XxwBdb9lKtY1645hVtS8NVTL\nllkocaiTI5tNz9VTd95HhA==\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-17@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCuCTsHWrIK2sJz\nRvgyT/+TlFdArLXlaL4JBSc+m1bx68CBdlSeu6tceDlxgUnfvTCjWvHNI+S3bn4P\nASDFd3ZPd4kvjDPo/C6Wy1FlqrjM+nKMNkTSEztVvE45uz9QejP/TWQ4Aia8UgtP\nJV7HiJhj41zQmUneIhZ2XmYl4drIGBLID/9yPFj4aK4Uqqe/N3/EXN5y9yytd5A1\nzV55c3MaGfmYaYzrMRMQlVkiHwVWLWvm8ttDQQ71icVSvnNlDZI9KNZlGr5mXRnM\nLiY2re4GNLiWerdbj4pflLAUuc+1yKMZaNF0yrpOLJMKbuJaFYM7g+dBuYMd2sEM\n45DaQ6rFAgMBAAECggEABH3pf52YJc6SoT4OLuJAsvLrs5ghk7u51+rBogyJWHIg\nxFalBXnLiPXzaZoQKY2tATJaNlS8VP2tlD6PtXkJXTC1IjyIpHVJ0IuL3MdkwKmg\nJj1KVm+3otVa4YOTNUUKLYc2VHm9vTOS5iaNRTIh2MYoAZxLO0f+82wpT8X+CxcF\nEV1gPB9e6lmb5TgLe15hLQBi5d/CBhYcS6qEc6BvXCukMr9Y2oj6v34xN+69fy8O\neGZnmfemLbP8yElHreQNu4sb2JrfEngYiuh5FpP1wKFxfp/EWNRKeYLmQmyMy2B/\n5wyLPYZ6b6FLHpOmnraqBEe3dsKeqZsxu0JSpD79AQKBgQDb9jOfPYDQiSofRaKj\n23PzYwgLipuobZF73oYgY6pox3bzLS9Hglcsp/9jn7X7Kus4xf9w6misP5rT1LaY\nyDLuLl3Y9FARt0oFJNJA2D3geOBN33IIEIIGWBeA54HBGFCM1U7mwc2krt3ynkvW\nc/cCWuXkzWOV4aKJMajgIU29gQKBgQDKjMfHHuxCoZAYe6Y3SM69vJU8gcw1WMZQ\nnCsmdBci5oAo8TyaB3xm1DN6JPYHOrANhqxvNZ6gGnobcvkaYPY+HL2c2aQOBdhu\nx3EVt0UYvOXqg/23c4RGiZbL2GtBGYcHH8lbhDCfjox9Lb3rE9umV/46YUDmxNSB\npONhGskXRQKBgDtQ3EDf7AHQS1ydgatgPZdvqDa8jRdRXL8jldXcKpMQ3wHauHo3\nKtzu/M7XvdJak43+ztCbVdjFWjIvlYID0sAqHsKnt4PfgoV6lXxJE/6Zehtl2zFT\niky9qrDnPTVeIjKoPxu5PYRgZ5fKmjbdlMm8y2v0+xrq+tK2Yoz2TimBAoGBAIuZ\npeNuQ6XU1oyZREEcNCl/PVg7mXQ3IE/UosTZBE0wkqolQgBjInF41ZXcvZjT8R0R\nce0gBpkQRpJ+loOAypaalnDxa+miS75mRWGTM9NN9iTBHe//dO5sy/royVtP7cmS\nNeSWYjDGPbvU9+16fUvTn8u61dF3XYOREooNvQUFAoGBAMCjv8my3XxnbeKAy4/C\nENgCm2wqeHuMI14NXwF0IOWns2JMHex05G/GHQZLEdXUZw+2Z4vfGGifAPsEJetO\nQHcxY71raj/KN3Abv9ZUqerHKzVx/8IX9X6Kj+U796mbBaYO79Ch38ZeUsN9VytD\nLy7yvJ5dBw8lY7Ki+2/LaOhr\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-18@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDXqT+olo83+EjM\nrJtX/HFVILmHx78g5+LXGat485JsSU3YnAjGvpJDiGIERM2t/F/l9Fwvl3nUDMxq\nex+h4lV8AvVwADpw9541Mhw/Q0+2d4qeeZ/niJLbMidiQcMZuAkuPhQ0EfVxDOdt\nJPmr6eDzaGi30Ajf9M1suJ3K2plczxCQ3mr7wb4bdW2w3YFPLZSjnQMLXn2835tN\nvOANt7snK8+Y4LwhG3cFcjDc6URiRB1KL1FMIdVY+ptfzWQf44WNwKgz1XEwZ8J0\nz0ckP5ONnI4Oc0uSp+MOHhV7h4izGeojTKEgZjz2FjdVeu5yL/bSOm0Pe6gCkDe4\nJL5WYSl1AgMBAAECggEABH1lg2LJmYc0QkBqmp0E+QL2W1FcI81gFh7LAsogePLv\nvdNRbi9G3xY9wCkXc6tYMKz+poMulbhbCauRLkB6//Isu3wQpCNaJIiOxKDE/JPU\ndGFbBu+qAk/KOMBS7KTU/TBs2ymSjYSQwcguDwuxauoPgvdue4FS/ys6yQhqT/bi\nvJ6eyrvdXKvc9roUxDbww6ZV3NbO467b8MLwn7ej4PQwsOG8ZL+v1THGM/I0x3j8\n8e/Xe5FkQBiPGxUFSME4hh8XVugGvDZbFed8m5vQ5okiH1NHKM6JbogAqW2T1iHQ\nbOG3WNX2Rb+j6GXAwqz9Qz2hVE95MhDu0FrLar/vkwKBgQD7L/h/9h8l6LO2Srsu\nE/0ypMWzBqCsTWfsBDKQAfd8YgyIR24J0e4LRgZ9pKnYb0NVZwy0uyr5bQbFM/ig\nXlBtSkzCfCNPkakKkWh4V9nDrK0sRhkxj9tDvCP7cCN7eSSkaAyY/COhFhZ2uv1r\nQP6eMcbC0KDq4Birqiz4EpPAswKBgQDbywcrk3XWBew7MKbm46xfxQiC27ixN2Ws\nyGg4XeqJfNSIgUoibYYX7SOTpgSgZmuXE16opqrWA4bjylOd+XGguTffX3FHljvI\nt6dkUbrBER+QXVIn6d4norHJVdNIK5FeBsk88LuS6ifiO5j8vJY9y6s03tFhxRkz\npTWBA32xNwKBgEm+A45Ni0dt0ZSqy9jzNVow1XmBcJok/2VithVg/m8dueAoWD25\ny9CzdiRcuyA3SeVAo5JLgIpJX7t1ToCGL8ZmEbLnDtbFRIM9vRXXdK7letGMosjS\nGuT/zvB6M3CEWCWMBmbDXxJjkaS5sLxUEGwQ4PFAnn1V3OhIxXruuUHRAoGAI1oD\nfDnKkTMArQCFR8vE1N6PIOUQTsi3PNQ7Fx3b9GM0mAQblXACSmTk/QGN6vKuSW1f\nI0czYRrOHmNTkawmX5CK8Q2b3cTHNuB7NwKCRD1p00F/TlYqWjur1tNMGWaQigwT\nYA7kTJwG8Ddfwv7eN3BDyEwyZ0RZalofQfH6zH8CgYA103Iuy07ReoeronYF+7+L\nO+wk4KHE/5FOpbjq/pITJqve1imC3BcyWRwWXJUOHI+bhB1s6D2QxAUZXe3RrpnT\n4f5o97f9q5xdLpdXZftjkpYeC0FLaFiue3A4hDKHTwX0jisjdiU0NVmN1ZXTsVSg\nLG9MrsCqZMRU/OtjHD83FQ==\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-19@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFNq4G59lwvqys\nWw0nBnwp8Nb5tN1MTs4ek/+4QWuSVhZiu67p8t37ssCC7PxCmm09CtsaJPH1YefR\nkyfa4mgfRpXcvhtt4k6VwYhm5TyFTPrETkCgvlO5DGyWYt0xbal6OLBbSYepIPxW\nr4U42tOl7dcZCbsrkeMSNvEh/dEFrKk/tDP6mqsKeTZykpnfP8buMR6fOHTa4uan\n8kGASuXLghCFAuiuIZYV4TGzncVbzyx5t2UYyuIswl6jHA2Jzk54EB+OkTAuX/Nu\n4Dod5VOeFdPxZX/vwunNj7Ep5a2ahXCNbAR8nKl6FCvAbHHIwx7XF+9Vpd8b/kXz\nGWqlwBkbAgMBAAECggEAPFitC+PqP3u5Lsx1y9lKKTNPNP3JMc5zeBvlhiZOmmrJ\nUtEHhwMQNjLOgcGut1q1zpYB0ZA4kdOxsgmLioj5P4jD1tY9YnR7g4vDB2liCZAy\ns9sWH5nd2KQanjIGaVebIpEyNdzcLD6xuHzhETK0zPNofHrj0UNE7o/tXW9jhI50\ndCOJG6GgAlMzYR0JTjjsWu0U7cA6/19ZRmU19KkZSsi44T4Bwt8QOavMKPxfjjh8\nMXuBTZKGQmGN7N+Eh536O8vUdcMVfHdvD+PnwV7l1nB2MPoy81tBLk0zrUhREeb8\nuwJBpvqa3Q9EpUn2taK51VjAtUBt6wW3emjc8JUHsQKBgQD+OMEB0QPIxYNfOSOv\nPvwqj6Bez2BDp/OraM7e3HfFAMljiPB3mwSFLoARf5RWKnF8hUWn02jJJnR7YFrl\nWllmcKTne95yV7faZBRW++T6oX3UoOa5klHrXBXzBp4vdTCsSDK6lqx7bofq9s0m\nEs8uyw4DjJM34SEUpxqnjBlVLQKBgQDGl9bDkpBTtFzJJxi+amqJz2uAVL6TMTgw\n4mCuUM9Mjbo8xqzdxlTCxPaWOS/0LTQxrboiqqrJbsedruK86jW+kcVXJklOz0Qz\nZhvUXAz4VaRsQz1W8/7WcRZz4yUzNZf7XdK40J3Rk2wqDs28nT768qdErz8WgFa2\nzBSF27akZwKBgQDZ4PpJ/EEqCV2WdvpGb8zfDUl8+G6gjYkhFyp1hq5/gTUYwXyW\nhZ1SJ5BLbvRLBQVOm0ofk+jyvKqIMwS0HMMSMOikHF2B0fwYiD2Gb0zIITAe0+fq\nk6Tx+nI1Xy6jreSRQy93Czu4bfq/PdaFEwnOKOlR0WE7Ow+HC9CkWEY94QKBgCMm\nnQzg1Er8ka/JC8gobdMWs6BzX4gOHjQI3bP8+bRDIcPAJrjacgZHdp4AYUyG88YX\nSer46mHdCdgPLHLjwb+JbbSPQkqAxUGTwTlFUcZi4keHX0QUy/aI7cB1ZBA8XDpR\n0QqFYmnF/k8zb5cC/jLM4G531mLVNIQGe1t2GE3hAoGBAPA00uSdfK2lmLFke+va\nlIckzMmyKWtJSzVSVJVsIj+ezYLT8VIByYtphurHSnB3HZIbvR+8ei8S6oqvglmO\n+eQEp3ssXqS7hluhvrkuCwKNEGmuDJPokmarDkSz24HmCipXRaMvY3EbxQkRUNFj\nk9f+e5elsFLeTZ52A8bmmtGo\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpPGCGJjve2SM7\nB0Dv8fcUNV2seJ/Y94ap2oD1j4HGbuPhHEUmQUCq5Wqr4HN9zyVKY09LGQAw/MY7\nDBrT7P7k8B6e+TUtOMqhBBAgm/E6WeHZuUR4z84P2B3iOymLfWoD8pv/ekwC+vsF\n86bnvNXg+N7M8gMojNd3gB0XoU87wkUlQf1igK2AV/eAs2+tjZOS5KvZC/XemSBc\nvV9tNKOoZ03XAXJeX0hBeTZXSoLU6yXTXBXQerV0htydx9gjKnioBn7ayRNK1i3L\nWdIedraSEiIRM6WYoJkkZ68SLag20ci+gl3Y+9D3QxB99/eGZu6Q4RYr7FlHAK4U\ndAnzciHFAgMBAAECggEATcIQF5M5rwrVxSlwDM+AVyiuAbDqwSX6GdDrr+hgGGyb\nB7OVkh4pOFxwxsg6SHQFDkjTBg5WqCt8aWUGbplWBJrPdvvKEx0k/RaA0nrUO5tQ\nylj1vQy+AUmrcWb9j7nwHCA8zQXEJxpqfDGXXqLFIrk2pbQM/3S3C5ExzMmxPiMl\ncu6c1Dkeggdx6LNNU+lm/3Ep87pixUqlTadR1CyzSJFZK8JFB5s3Kod69OT234MM\ng/V8r54NOvCG2985s0BDIKMZ4A8qyLOMcTnzxtD5IQaMy7mB1nzT9mNSw2DLUhRD\nFvHet/zJbv6jab+/cbKH4ZNloVN/zBuvfDSUf6pPgQKBgQDY17Nit6qLEk4ewgkC\n0APfaqYeimjEE+PoEdsEcnBPLEpCZg7t+ctDrGaHIfLc5Skkk38tayd083tc04mK\nI3jvoRD2jgGY+rGQyeLMgJ4fxyQy/FbQ/ioYwit8tm45NWqM/5uSJ3+EwyCUnhbA\nkojprSiCNqfuAcrrpttWpwjSxwKBgQDHy+Pk6cQFFu542HddTBHFw+yVsvzHsdZR\n7keQEVwSMhOCFH0e1Xou+TMDB+kYbpXUktJK1bodMnD1e5GkFPb9dRY5pnqqzqkx\nxutq0CKWXhyb81jFO4dHoj3AT+IhlSFoifIJoxrkLhS5jw3Au/GpTzinGPbf+8ts\nzQ1ErHSbEwKBgEbEPlrdLd8tHimTkXVFhb4IBCa7bO1wwFQgX6XX4yczgRiiTgUE\nHH39aYh4X9YPQ5oYOM0Nx1a3j27/6kcWxIUPv4V3WrYeOozSFh4/a1tblki9aWfT\nStHBrIeK0fYBpMBXOuI72bXuKFfYL/yw1dXNGQdF5xAZrauyTKq+4HZJAoGBAIlH\nWLDixiLRHM2/vlRGfjeqZRZ+wxza3m2xEU61/tMpwSmxtj7HY4p/A0Pj3Y9B/ITw\n1LlCnPyOufqSCwH4vbRtDPZToxlVof9ntD3SANHcnD+zNp1eR5c6rL9EpBV7CFdx\n4PIqNcHuv6K33jU9bdBtdHmrt4Uy1xVM1v8Gl6AtAoGAQF83Ewp39E98mJCKMNeJ\n1LjPx1c8uFmPjw3i0XWUGKYSBhSckNBuoe35RGujQQy5ScaXGUjgN510Og/0+34Y\nn8Pk3tL44WEcs9ULQXFoWGBCEslbZoO1RjcCPckcLM+9SlrBPj7DTfhQFLlSQTjy\nbMmqArLWoY4bzJxd8zMc1k8=\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-20@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC6nO+iwM3aPuOf\nJlnpOtsJMiyK4mFYhx/7D062gJQvX4YFoYBpAVJSCLJ9I70dtXbHS0ElyHX5OXCE\n5IeVbY6DQ0GUNFbzyqSUHYm3CxrE5vy9Bgfmlqi1cXaNwiORb3OzeoP93WKNbW/3\niQlCcs/QIzESPI2VCV+fq5XBDuZdep89ljlof5DJ8XPcmxqjnwQDt+FYMcyttsnh\nXJg0sfjrTkbogxHE7MXxnYRyQeSspmSG3mavgDpnXL6tcxRGOPqTzhKDCVBA50uA\nGzFJzVF3NlOL4IL6RexbQ1o1Vazn7SfesSwLlCa42JlCIlJ760V7vWkanv71jfS0\nUiv/mYwtAgMBAAECggEAGI9XfY7M+Nx+hh9cxXSMx8rN8HBnWeicxaTH2f6Voh97\nCsos1YUKQcgpv40A0oRjr8qAdjnKBwUvgRn3myu6Th2/p4L076x7mQ/DJG9GdGQn\nHrSIvSkWZpzaesEyf61Qp64n6XUlx5G/4u7q5E8qeQzspCcKhjMf3eqN8MTmfiZP\n1fdFERg/RO4Qq+oR8gZfY9/IhVPaT68mpxm0I8uhAN42Gdw2xxSW6rKz+L00/4i5\nszrO1Sw9E/elVEDtApieVy356w8diPsWhMafa2V7J6pdcmkCcS4maeII3hXX++cx\ng3Jx0vCv3VH0kL8Xor13cTNVdi6NqkL5y+I4bJzqkQKBgQDrhfO3q2YisR7OmPy7\nBpFrV5q/AgvYdqFY6cOOfvglIGEMw75zOMLwDxVNcIClkOXelxCWxyd7TySQTiaZ\nSSJrbSrllalu/RNunMfnUO+6WvsB7N4yIPUeIVZNsYvuE1v+4IKiNlF0xuHg4Tv1\nUuN8ehCJejXpYWVpCAWCJM0pPQKBgQDK1mNLUQJbkFP7XCCdY+Tt8aRl1WnpChjS\nfyE2IF/C0M3uH3In6+TMmAYIM+bfxKQia4aqpugrR9W5CMA35UnCc697hQZn6CJS\nnnKxPJs9CoMRT4L7+tgfaIhyjz0HcXtEFjtDYgL4SYpzLEO79OqLb+3tjbnuOIJE\ndZc7yGa9sQKBgDX8OEcLZJfjHXqhmpyL/t0p8XCC2ZA+cPFec9K/y8VGzLgOTiM/\nCX/ZFTrw5KwOsIH7AnRtJeGf3HOvVi2gk+En3sNNMM8d90xNZ4zgAnMm0443ax72\navkDDzMz1S03Bsk/UPI5nSY1SCUxu3qaC0bG++9nMeBS0NnoWsrgAJ7JAoGAFVlv\nZhQGvYB5dnGB9U74X5sZhKZr2V14s18yLbJGogi8RB4HM/B+SpKNv/tGh7L4266Z\npAihUzziX/Ft2fRGSTNH+yZLQFCMnEmVJNaOOGSM2xuVW9RRPy0Pf49YCxqEsOvu\nHO+KBHwpGGpGTtg+f6KuVlyef1ZvT6lY27ACMGECgYBbKNaNterMuuzv/Gydhwkb\nXix/4qw8P/hS74SK+BueeotcWcZoEk2rS2ohvwAOyvAniyH9Sj/zs2hqfvS3nwsS\nAJCdqDPBYsG3nSXH8JTvrgGlArC4AMe3cyC723qWhxzE9jph4z1UdYJbGWTfEegH\nvvyBoA+9sZEfYv18Z38ayQ==\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-3@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCtWCCX/WiMoWCy\niQEguvGAUjjN55Jj9NT9jUeDdMHAImISYbcEpBzoUZm5c0lQo5Fj2Oj4prq0Qg6y\nlFsRyga1VIplAOhnqVQxNs+9av/4Cal4YJWDmGsTaFEWPO4HMUFjfKkJtnZO39zk\nmr6EUnVlGPAgqF+b4Em9i+GdefCqw2/gpxSRRsGIu5MzAu8JUPn9ZCqdqbvihaw6\njsiOPgXITSLrb8uly593j8zjgMVXr2On/KenDF52CH/BpLYRxN6AFXbZJfY0ixQT\nGJ8E+GGc549EYlyc46G4Vipr4h0fxgD84UnWNl5HKi7Kc/oPW7JP5rKX7TUJEbIX\n8aWAcnDZAgMBAAECggEAU6mBjanOIHWw1GpgY3omne7RILvAAUNE2x0pY05iRsex\nerqzmOdWVmAv5/w26dcQEFc71equmNp6+oC01YiipTjo1KfUA1gL3Pbd28d9RCrx\norpG3y0cnNDPtgJxRYJl00zyzs/EGPxdwe3XvsiHhWQ8XR62imZ9YKDXIuicGeYP\nQQusmejhnDl+cLzTuEYb5YgHrvJ/XX3dj2RA7ZBmyp+ODNRb0qLXeNbIgulQR261\njiT9PG0e6lO1oUH+LMvduLLWgB0HBwi+rOHbLHka8NTxvdU2LvHAEQFzGq5xgXP2\nGUYV0L5JDCj1JRtmqRgUs6Y92HhYlO5jUhi9Kcr8awKBgQDXJxbuZjdKm9YM/dWO\npOx6VPnvFIZjNOh0ksvU4EVfnBFkarw07ToxvR6zDCq0qXbhykA9nywFJWs93gr5\nMA5IGfdtpj1amTVA93IVULM4EPe4aa5bVNCUqotQatkNoJFDGF1JvK6YFQPIxszi\nZ0VdOJ6BDlX8HlRTeBrQxDKlEwKBgQDOQQ1YddLmrMVz3beb6R1Nn30NWb/a5uXR\nvpg8b+l8uNJsMXis3mZMOE0Q6JCEwkjU9nxENOneOdzR1eCJLalwhWC4aAaWwh/+\nTkhuSfsKAcdLZdaNQa5eSzzeAl3LHsTL9xrUS5h9JyWbXq3t4NMOpMa6AvmLlMy0\nZh/Qz0zL4wKBgQCPHMBDGZjDtv7dq2aHOKrYAHgzkJqHmOTazd5pnjhnDYAAJING\nTVn9RcgK3xf1Dhg2vnqWwq7cSXSZNX5lHJMTYLpVpFOBVRG4QiAPj5t2usqcTyec\nNsF7cimy9y+jwd9+GtHKv4f/P1NCFQKpwnnANW4xeCC30FDVKLnljewGIwKBgQCX\nrsWmybfZhzQLGwJ9+blgLauk1t0+mlJnpxiEUfVPkQjHIrbRwxlOcpVSmwY1bEBt\nxfvrmVJo6PrZosXnfJpAswZHd9Foq8kll+KyoVuqp1Yuv+1CowweMozH5Mufprgq\nHEcx24qAd/qzQbT93Tq6aTnw8GEfYsYM4ZICWYHr6wKBgAsFXtqJy04e+z1Cyivc\ngWFW3CK4zNkPqXfRVDsw0KT/CP0RF5OHXnqcwugtZj06ku78VtegVObP4sSp5TN4\noZOAJQT1yh13bLcVWX0pYEprq//diG/0JEaLc/37SSRLUZD5z37sPl5xDf6wgZp/\nmlRnBc0kWjIbuuhVBZ581rOu\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-4@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDC8u1p/JpuWp9F\njoOFbW4S+UDKem9CBgYmqHOoGED+Z3qZd9l2rYoda1FtE42sakVwwIYlMw9vMIh3\neYLwqrZIpwDyM9yGpXYLzOaB3OeJJDI+wVzbNjBglEIqTiR8RBFlRCfGjyPZpQ7e\niKU5HAjaKBw3TNl9XRtU8Gx4zl4DtuuIS54eJYd9dVXi+g+biJVgIVocqO3yPrkZ\n0A5+vGnodA4ELQ43S540zFc/Q8RZL/cSLUYEIGVQWQUaFrg1S1gaAh4tIxZPTbPm\nTR9v3AuFW3ufSudjT4FcbcFfdf0tInM6G/2DWp7dyWDYX5l3hWoqfb89RoLMh181\nE00n5dJZAgMBAAECggEAAic6Srf8fq6Kj4qeBS4fMp9ztW6irAwm5SZStW8YPK5j\nGMY2VqQByR3avoWK/qSSB96mU+5nCY7FQ9QycBf6nEN1C7fN7MxvscJPBmGJvyaI\nhBW/qn4s3ilPPCR6W7AbJOZU88YVPZraEQ5ZmBs02I0aaNyvHnhQHb4xiCg9jAx7\nd4K9ihVy96ccGDy3yjfBV467JWJWInqs9eVpuFOpzgT5NNguTpelKclqeIPJE5pZ\ng/77Er0dWohhBsN5LV/smyy7DyTjbcoaBus4f/iBufhsv6uX5ZPWAbMBTCXgn9OY\nY+A+SgwVn5HhS+cMJaiIgNHv7/Gm5v63pF+vQ1fyDwKBgQDfbeMF6QilxN47gQBj\nVNyYxcE6DlUzEWutiEqkFey6Lz7GsVz7eNSH7vyF67ltKLoPo/uULxxiGUQC/Xul\nLsS+kHicfzFLzIsq9561t/KZK8sQMCzcKjKLu7bm/FgXoKkn6qt0w90KhvS8oCSb\na4EbylAlZ1cMKAJeK5bWuch/gwKBgQDfXjB5TvttSIzGiiIsWuUMlXZ2VwKK9V8Z\nUdO97rpjZboT3cq7Gdq6ZNuChG5vARSXE3twohpXOJdbwwSU63u5OAtovh5oERSN\nTC80jcarlhEGftSi2YbyWh+NksAhGZ49NNHgVhjSuKXgmF42RSIRnVFTZ0HW9mGS\n32G+xnzD8wKBgBs8dQFCcAhtID4WsqppLN7+tFhUaPRpujuUMq0f8xSbL8be1hvd\nleLgMi5NFvSEk3HWppNgzs/yjoTiy5DOS7ODPwCszKCV1Z0uRE2Yl90uJnnZtY49\nIp5ACsLLnh17O0Ofark4KxjebLUVvICpsTpnBjAZEdZshiVeoOuaCCPrAoGBAKqV\ngiuCmB1TpL8TSxnYqMg9dOTXekepMGFjznNk18+FJuB5J5RQIGztDX7VqIj5qEHg\nTQstoTQvMdiQTPV2CVzgYkYxu4L6WFm4buyRwcHUr1fokHd17Ms07JfwFO6yY9iW\neBn9ZqO3BGdLtdd4YJZXMH6jgvKp4saJ9ln9t9blAoGAOJ2RFby2B8C6EK9BtnXP\nlM2sfbAS4xPxc0Q/9awQuSOkrA7dWp5oPnAmzdRmVES90oTtcjHZWYIGcJtNQYAH\n19rbB6zj8e7ll3N+EazUD/oNdJhrIYQdYzmeL5shwn8YKlULYMmw/1Ix1VhWrZSz\nGQkwf+tPYlYTkdPsvyxo8rM=\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-5@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDeNQ/6rq1B8tit\nvHP6BexFhvaTupFupICwNkXHHYK+73ILKoLj7cuz4WTNh51ebkyrx1RPCHW8K6+/\noZWYxmbj6BLmR2aDzVtn2MwZcpOHSlIb+ccqjEzeMfLnDP0GyI1gSxg0gCkjAQim\niCsODO2KpVnUS+P4a42rGQTD/njy5N4LTRYXQHmabbh7lE7tfgTTetddgmwkExMa\ne1wQJu5qoj8OkL9gnMZy7PXDJTxma5RdYemJCJXw+2a2N9qAs8zjPeiBa1LWTjUE\n+ylJiMgWLx24hTst1xCTH4yw9MFtwTtwtK7trgJ2wN9X7g6yDwUeEDlklGvoIZJm\n0i0damnzAgMBAAECggEAZGOztu1A4GkfRIq+GOihIJ5De2WQO9z9ON8kMjuebLXQ\nH8RSgzhVTgzYFlUdH2MUp4z0BYrMajmQerK9W9rS9EdOdpQueACIuceEGkEd7sMA\nipwTw6DEP6RwWbuP+wcTfDwhEOMP8r0OU/J0BTKJBRkEFvo8YejxhanVcdjfethd\nCCbSIs+19DCzRU3x1tLl/JBBumwRDAHesFIU+Vs5ttK2ymotKU9UU/3BqXF9LBq6\nHxIEjRMKXdgTsRKsgKOvbxvAR+FMXl8KNMSl4emHTe/kVmnY3slBa+4BzFA0iS7J\ngasrzGabwjTRGcO8JRxXpcgAONgMVvL6Y54Z7cHLUQKBgQDvZg2TY8nFSbT0m54G\nEBHnFLeJW9lhRc4dyfwkf2PEz2JBPSg231Y9dA4GlpR5qFl9L1VQT6wLKQjbLsnh\nsYK3ld5xwrmJFMuRC2DwdXcTjEZVEznOhIiVb+zZECoJcfGr51OPKp6EHWLXa5me\njBZ9E6NOHCnPUxRGRcOACEb7AwKBgQDtndFnSYciVHonfdomFVoxv5dBGbzCozVH\n8+3CkyJN6C4Kgmvr/xylyNgzsFuQbftrGNSPylFoB14YKXSf3itqPnPM80rxsyDS\nS09ZZeIY+ikpJsuY2uZe5/oMzmMsaw7mnwcheA0wHsRrptMhkaivqAj+zHIFE1OS\nC6dhRReqUQKBgGGxS6jx98zCn02Sk5H1zNh3483x5WuEiPAvFO3v7k7KMlZdFqQN\nz6uUSIT3ve9He/1R64ayfIqxXCPVnBy1y5oPVo8l34DJM6kk85Is3ULk426kQdq8\nyt/wpL6Pkhf4n55+7+Jkiftv4n32MuI4WJUCBopBg+5PAN8MaRM+TXjxAoGBALzJ\nJ4ddhs0Cuy7HMdwSGN/vrZeegDdP/lQVfLCbv6SQNIxLBL2yqasaAJRIqOb+SsPT\nLYa0oqr5N4wQ28TseifmSJDsN34C6K/L/9YyOUnI74zvctEWEfQTcLpd+7Ndt7AJ\nZ1vzCt9RgpNZLuO72378DXGLM4fOzBX7xldk0qGRAoGBAM59QWHd54+d2rMQMrHc\n0e1Gc/1bZemjU6LYmBhoEbIgnTYwKJeAb+8/QQ75piNjbtvNZtbwp5WCSZ/ZJrl9\nOscqX7jaI5WLXUenHNTIQEYbHqdFYJtTUFoILHGqH+Mvm5lxmpiNekgLeoczUhCY\nIK33VJ0RFvPNPYXQWaE/CHXq\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-6@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDIVt4Xi+V7SvhL\nfX+wblmvUB1De87bIrXpch5Cmbn1S/Ybnj849bxWo+p3lPRfQLHMyZjl7515EQw2\noGnn0QghoJB3p/AWOmVJzPJHq+tyHyFVPgGYG58k+D2bs+wUIk1SrogHzLwFKCnw\nZdtAA4x0OFzT2mprw4TbUqcsQi//GMzIueeGomFaHaRoAGTDBcMDoJl15qyfQcJ7\n1j1pOhO/7MozCX/vIg0n2O3AdGBJqzykVvzMZNx3oj2TQOr+boOvj1LdUizBmzUW\nz7yGf47YBd6i5hopPBOgjZAMks4yppKX+22sBero+8mtLVm/v1oTKdfoyhBVFNj2\nR1AceiEdAgMBAAECggEADDzc3YywJ0iRw5rA8rgVm73wa6+ObUMWNafA7XSShXIZ\nxd90ITicQ/aeBfwACX7cMumbAMC9r9Ljb3Amcqte1x8FyX66uGuMxbtSjso+XFRG\nfFHeAGVU4rSUntmYxt9pixlvjyUUfy7QO7JyeDCUoyzQ5CgSxCPHY9ZisTNsgc/t\nltvGyw7hEnzZQ5yvbrexQW5bghUuG+FZiFdwlgwFg58XsFORq/eh4sENJL5hG8rJ\n9XNqWqkvw1oomjuEeJsukMTP3szBYCSwUbX2fb67h4FAoa36VEYkt6fM4iLjPS5g\naEGBvdqWumeW1bEkdvNKT26p3f2FylM6odkXn+YPAQKBgQD1CLhbxna6v0E2nazo\nqI6gLDtnMEMplbqvkIQT3C5tTxKj+4UoxjiH7+WUXiycx4hHa7CFhiOk2VLvju6U\niJMKylKfpn/4C9TYshpZ2r419sf0mRgJcPbTPjsfAs+NT+4+/46eN8cSFWlfObX8\n1GAihkB0B3dT9JmJI5NLGdmNvQKBgQDRThfzE+tE+jtiYNwi1E7PCr94wXsV1Wyj\nM+b4jtb8c18IMvXTHkGbEElM0iHfwwcX0ovKkh/7AU3mnIHTkyrGySPu4UNWdYaO\nHk52AGKU+X3aKZyHAU9gf4itMdnCkK3+Vdc3xU8NXqg00wv3EVRO3bh+kW3HLBur\n7DbYe4ym4QKBgQDq3UXgadVp4GIAmJegldfHfT4fBSqLFIJRP4LpilVR3sXuOeqD\nj6Ol4HK8iJvYVoSweG9FPLKzkr8k8WqLInFWmWEit7PXLHgCkIwjbkB9dyJnt8pL\nWmSrS+3dJpOMTn39EnVAABSmp7FNXgKq6WGQFgB3dqSQ61WzFk9bX9agPQKBgQDA\nox2LzcN1wtExJHC3Zav7BqtfWsQMPlg0hSqJjf30b8MBatWxr2E2dHDiUWx346n9\nlPywPnlMrdCi9VzP+90dBDccPxuY0aY720zfck9JSa85QZ8c6mnCKN8EeKMxXbOm\nKB9i5yhw57PsmmmixcJQq+SIKRVegQwe2dNIv72eQQKBgE2N1WBs8zLm/WkTbLa8\nX34bimFqnoxQME+k0B5w2l0tPcILqFOR4WxOPTC9Ngk/r2Nogw+Wfl0vj6EM80SH\n9y1otWwPNOwevW2ckFFs6dwMAnBLNBRiom6s+pOzlRwvJvc+Le4Tvl/XT0Dz8vfT\n4g6KCF+7hBabD2KoNsQ8+96s\n-----END PRIVATE KEY-----\n"
  },
  {
    "email": "tgstream-bot-9@tgstream-drive-proxy.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC60k3ZXj4do0vn\nL1Pmer2xJk5S5yHMSb1kshzQ4lt65tSVbpvt3Aa83LRboIqKsrdPN0QRQo79dhTF\na3VWE5qTqOO0yto5g69/gZiu4vgFx0FTp4aOGG4e6IBPCcL2lkaImDn8lim2WdOT\nfR4tjHBKWlz8OuU2ocLE2/BsbDIfz9isQ8g6q5SlbJKiaUODGrpKh84V44UJbQms\nmr9v33jFbsmouUGm+4vRyAo9bHERkaMA2QmHGyvKeU0V1K5z0hgYVol1LFsB52R5\n+wvjOqk7P1DZYEYrsAMqO7MOii3lrLhg/1XWY/K/w1WCEzX8lISXUimoMnEmhmwX\n7TSwwY6nAgMBAAECggEASgJnMb3qeJ5IwwCWSb+FJ0koDSKgWog53crLrJqHqAQK\n4lnrrsqT5ry+PHA4giKziM+5iObns5RUPTNJS/y/J1DoSCZ2VgOLgkUqYdnrbIqX\noBbFMMSP13G+5tDUqhA1SAaaLiykwKcMMKkHy/6PO31ZydhhFof1mzwQHjusjboB\nXwiBc/w/Cpare0z4BGSyavmySGE+bWY8y+KUU3eR2D6GeocIwiufUcPXX0Z3X/q7\nb2GSF9iIBCeAxoo6mT3kJpauxqKXgxXeiJMzVPKYezcbvauIw5YeAkKZ174X91fS\nnNjMe9YDiWyY0slCi/La56tiZzW67CUNGhqG9lGjhQKBgQDhfN1gPMu52vXQQVJe\nMKkdEzmvxVAbRqJWsLeNDi2YhMWwSk/Wms06XURQXT8H8g7XBePrWFjiGoB1vtmP\njnwdmyEva1u+ehU5dgYQ0vQ2EDUWA4Xohc7W58jNDh2VnSic+PjcGllDE4+rjo+W\n3a4h0eaJqv9LnpsTOEY3MMufuwKBgQDUGf/Rqlmjz6DvtStaWez77FmyZuySklOQ\nbVKNiRA7Va8kLNz/p/2nA8T5y1+jTgVxU+w0Uey7sjcPkrSHZXn5jreWwWHCeLYL\niWjvSfB7ns4IXL7B5a/vJWs2FZDCulYg6WTwiTOgtImVsbmTApY7dmlK0bMN2PjM\nmTGXikdQBQKBgERoBxjtGLkXjj9RsdVVWdiyPmvupjDAKvu1vNmUFY0Rqo+i27m1\nWNF9/f2LbFXSv2HILa72LHDbrWELNyFwDoNEzrp+DWUp0EqQXaK4/NFx9UjqZLN3\n9JoJ00cyIxOCjBGjDoxnifDpfEqFg1Y3hl5IOXJGaBDe2xjnl5WivgOFAoGBAKCj\n4GEHyESNKLLkYCVaHmbfJ0A7O8n3EVs9sVyJBsYpqzCW2fq3XSF1dWZLZe/lU7H1\ngdxOgCHYZGNjFV/Gt48PTHTdmhEUI6yxMcyqD31RVXJ36/Im6A0UJhMcWjthrYHX\nwx96iqOYmOvLY2W4e9glYrHMCPTf8+/hxvGjRUeRAoGAcaDt1tE10RDJ4qepSh01\nY4ndVYV48wJQGSQuHKBSAYBg7f4Wil21SmmEF/L+gTrLYH+H3XFQGmBgP9mz5N57\nv2V1gselcjka1NHI1MuwX0TxbvvabwC85f5vKQP5CDAToJjmU2oW7M/oysUcR2AJ\n5JpGIsutovPx42FMg25agfk=\n-----END PRIVATE KEY-----\n"
  }
];

/**
 * Base64URL encoder helper
 */
function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(str)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * ArrayBuffer to Base64URL helper
 */
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Native WebCrypto PKCS#8 Private Key Importer
 */
async function importPrivateKey(pemKey) {
  const cleanPem = pemKey
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  
  const binaryDer = atob(cleanPem);
  const derBuffer = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derBuffer[i] = binaryDer.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    derBuffer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['sign']
  );
}

/**
 * Native WebCrypto RS256 JWT Generator
 */
async function createSignedJwt(clientEmail, pemPrivateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: GOOGLE_TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await importPrivateKey(pemPrivateKey);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  return `${signatureInput}.${bufferToBase64Url(signatureBuffer)}`;
}

/**
 * Fetch Fresh Access Token from Google OAuth2 API
 */
async function fetchGoogleAccessToken(clientEmail, privateKey) {
  const jwtAssertion = await createSignedJwt(clientEmail, privateKey);

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtAssertion
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('OAuth API response missing access_token field');
  }

  return data.access_token;
}

/**
 * Read Service Account credentials list from env secrets or fallback
 */
function getServiceAccountPool(env) {
  if (env?.SA_CONFIG_JSON) {
    try {
      const parsed = JSON.parse(env.SA_CONFIG_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[smd-token-cron] Could not parse env.SA_CONFIG_JSON:', e.message);
    }
  }

  // Support single SA secret env vars (GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_PRIVATE_KEY)
  if (env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_PRIVATE_KEY) {
    return [{
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }];
  }

  return FALLBACK_SA_POOL;
}

/**
 * Send Telegram Alert
 */
async function sendTelegramAlert(env, message) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('[smd-token-cron] Alert failed:', err.message);
  }
}

/**
 * Scheduled Event Daemon Logic
 */
async function handleScheduledEvent(event, env, ctx) {
  console.log(`[smd-token-cron] Starting 45-min token refresh daemon execution at ${new Date().toISOString()}...`);

  const kv = env.SA_TOKENS;
  if (!kv) {
    console.error('[smd-token-cron] CRITICAL: KV namespace binding "SA_TOKENS" is undefined!');
    await sendTelegramAlert(env, "❌ <b>CRITICAL ERROR</b>: KV namespace binding <code>SA_TOKENS</code> is undefined in smd-token-cron!");
    return;
  }

  const saPool = getServiceAccountPool(env);
  const activeEmails = [];

  for (let i = 0; i < saPool.length; i++) {
    const sa = saPool[i];
    const index = i + 1;

    try {
      const token = await fetchGoogleAccessToken(sa.email, sa.privateKey);

      // Write token to KV by email
      await kv.put(`sa:${sa.email}`, token, {
        expirationTtl: TOKEN_EXPIRATION_TTL_SEC
      });

      // Write token to KV by index
      await kv.put(`sa_index:${index}`, token, {
        expirationTtl: TOKEN_EXPIRATION_TTL_SEC
      });

      activeEmails.push(sa.email);
      console.log(`[smd-token-cron] Successfully refreshed token for SA #${index} (${sa.email}) -> KV Written.`);
    } catch (err) {
      console.error(`[smd-token-cron] Error refreshing token for SA #${index} (${sa.email}):`, err.message);
    }
  }

  // Persist Active SA List in KV for streaming proxies
  if (activeEmails.length > 0) {
    await kv.put('ACTIVE_SA_EMAILS', JSON.stringify(activeEmails), {
      expirationTtl: TOKEN_EXPIRATION_TTL_SEC
    });
    console.log(`[smd-token-cron] Saved ${activeEmails.length} active SA email(s) to KV key "ACTIVE_SA_EMAILS".`);
  }

  // ALERTS: Check if SA Mesh is exhausted
  if (activeEmails.length < 3) {
    const alertMsg = `🚨 <b>CRITICAL WARNING</b> 🚨\n\nSA Mesh is nearing Exhaustion or is fully blocked!\n\n<b>Available Accounts:</b> ${activeEmails.length} / ${saPool.length}\n\nPlease check Google Cloud Console immediately.`;
    await sendTelegramAlert(env, alertMsg);
  }
}

/**
 * STANDALONE SCHEDULER EXPORT HANDLER
 */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduledEvent(event, env, ctx));
  }
};
