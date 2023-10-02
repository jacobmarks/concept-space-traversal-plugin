import { registerComponent, PluginComponentType } from "@fiftyone/plugins";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import {
  Box,
  Slider,
  Button,
  TextField,
  Stack,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SliderProps,
  CircularProgress,
  ButtonProps,
  Alert,
  AlertTitle,
} from "@mui/material";
import { debounce } from "lodash";

const conceptMarks = Array.from({ length: 21 }, (_, i) => {
  const value = i * 0.05;
  const label = [0, 0.25, 0.5, 0.75, 1].includes(value)
    ? value.toString()
    : undefined;
  return { value, label };
});
const rangeMarks = Array.from({ length: 21 }, (_, i) => {
  const value = i * 5;
  const label = [0, 25, 50, 75, 100].includes(value)
    ? value.toString()
    : undefined;
  return { value, label };
});

function CustomButton(props: ButtonProps) {
  return (
    <Button
      variant="contained"
      size="small"
      {...props}
      sx={{
        textTransform: "none",
        color: (theme) => theme.palette.text.primary,
        ...(props?.sx || {}),
      }}
    />
  );
}

function CustomSlider({ sliderColor, ...props }: CustomSliderPropsType) {
  const sliderStyle = {
    color: sliderColor,
    "& .MuiSlider-mark": {
      height: 4,
      width: 4,
      borderRadius: 2,
    },
    "& .MuiSlider-markLabel": {
      fontSize: "0.75rem",
    },
    '& .MuiSlider-mark[data-index="0"], & .MuiSlider-mark[data-index="5"], & .MuiSlider-mark[data-index="10"], & .MuiSlider-mark[data-index="15"], & .MuiSlider-mark[data-index="20"]':
      {
        height: 8,
        width: 8,
        borderRadius: 4,
      },
    '& .MuiSlider-markLabel[data-index="0"], & .MuiSlider-markLabel[data-index="5"], & .MuiSlider-markLabel[data-index="10"], & .MuiSlider-markLabel[data-index="15"], & .MuiSlider-markLabel[data-index="20"]':
      {
        fontSize: "0.9rem",
      },
    "& .MuiSlider-rail": {
      backgroundColor: sliderColor === "red" ? "#f00" : "#808080", // Set the color of the rail based on color prop
    },
  };

  return <Slider sx={sliderStyle} {...props} />;
}

export default function TraversalPanel() {
  const validBrainRuns = getValidBrainRuns();
  const [brainRunValue, setBrainRunValue] = useState(validBrainRuns[0]);
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const [startingPoint, setStartingPoint] = useState("");
  const [conceptSliders, setConceptSliders] = useState([
    { value: 0, text: "" },
  ]);
  const [scaleSlider, setScaleSlider] = useState(0);
  const traversing = useRef(false);
  const [showStartingPointError, setShowStartingPointError] = useState(false);
  const [traverseError, setTraverseError] = useState("");

  const lastSampleId = useMemo(() => {
    return Array.from(selectedSamples)[selectedSamples.size - 1] as string;
  }, [selectedSamples]);
  const canUpdateStartingPoint = useMemo(() => {
    return lastSampleId && lastSampleId !== startingPoint;
  }, [lastSampleId, startingPoint]);

  const handleBrainRunChange = (event) => {
    setBrainRunValue(event.target.value);
  };

  const handleConceptSlidersChange = (index, newValue) => {
    const newSliders = [...conceptSliders];
    newSliders[index].value = newValue;
    setConceptSliders(newSliders);
  };

  const handleTextChange = (index, newText) => {
    let newSliders = [...conceptSliders];
    newSliders[index].text = newText.trim();

    // Remove trailing empty sliders if there are multiple empty ones
    while (
      newSliders.length > 1 &&
      newSliders[newSliders.length - 1].text === "" &&
      newSliders[newSliders.length - 2].text === ""
    ) {
      newSliders.pop();
    }

    // Add a new slider if all existing sliders have text and there are fewer than 8 sliders
    const allSlidersHaveText = newSliders.every((slider) => slider.text !== "");
    if (allSlidersHaveText && newSliders.length < 8) {
      newSliders.push({ value: 0, text: "" });
    }

    setConceptSliders(newSliders);
  };

  const handleScaleSliderChange = (event, newValue) => {
    setScaleSlider(newValue);
  };

  const handleSetInitialImageClick = async () => {
    if (!lastSampleId) {
      return setShowStartingPointError(true);
    }
    setStartingPoint(lastSampleId);
    getSampleURL.execute({ id: lastSampleId });
  };

  const operatorExecutor = useOperatorExecutor(
    "@jacobmarks/concept_space_traversal/traverser"
  );
  const getSampleURL = useOperatorExecutor(
    "@jacobmarks/concept_space_traversal/get_sample_url"
  );

  const traverseData = useMemo(() => {
    return {
      brainRunValue,
      conceptSliders,
      scaleSlider,
      startingPoint,
    };
  }, [brainRunValue, conceptSliders, scaleSlider, startingPoint]);

  const validateTraverseData = useCallback((traverseData) => {
    const { sliders, startingPoint } = traverseData;
    if (!startingPoint) return "You must set the initial image";
    const hasValidSliders =
      Array.isArray(sliders) &&
      sliders.some(({ concept, strength }) => {
        return (
          typeof concept === "string" &&
          concept.trim().length > 0 &&
          strength > 0
        );
      });
    if (!hasValidSliders)
      return "You must have at lease one concept with non-zero weight";
  }, []);

  const traverse = useCallback((data) => {
    const { conceptSliders, startingPoint, scaleSlider, brainRunValue } = data;
    const formattedSliders = conceptSliders
      .filter(({ text }) => text.trim().length > 0)
      .map((slider) => ({
        concept: slider.text,
        strength: slider.value,
      }));
    const error = validateTraverseData({
      sliders: formattedSliders,
      startingPoint,
    });
    if (error) {
      return setTraverseError(error);
    } else {
      setTraverseError("");
    }
    operatorExecutor.execute({
      sample: startingPoint,
      concepts: formattedSliders,
      text_scale: scaleSlider.valueOf(),
      index: brainRunValue,
    });
    traversing.current = true;
  }, []);

  const debouncedTraverse = useMemo(() => debounce(traverse, 500), []);

  useEffect(() => {
    if (traversing.current) {
      debouncedTraverse(traverseData);
    }
  }, [traverseData]);

  const sampleMediaURL = useMemo(() => {
    return getSampleURL?.result?.url;
  }, [getSampleURL]);
  const loadingSampleMediaURL = useMemo(() => {
    return getSampleURL?.isExecuting;
  }, [getSampleURL]);

  return (
    <Box p={4} sx={{ justifyContent: "center" }}>
      <Typography
        variant="h6"
        sx={{ marginBottom: 2, justifyContent: "center" }}
      >
        Concept Traversal
      </Typography>
      <Typography variant="body2" sx={{ justifyContent: "center" }}>
        Use this tool to traverse a concept space. The concept space is defined
        by a set of text concepts, which are weighted relative to the initial
        image. The traversal will return the most similar images to the concept
        you have amalgamated.
      </Typography>
      <Box sx={{ py: 4, alignItems: "center" }}>
        {!startingPoint && (
          <Box>
            <CustomButton onClick={handleSetInitialImageClick}>
              {`Set initial image`}
            </CustomButton>
            <ErrorView
              details={
                showStartingPointError
                  ? "You must select at least one sample in Samples tab"
                  : ""
              }
            />
            {/* {showStartingPointError && (
              <Typography color="error" fontSize={12}></Typography>
            )} */}
          </Box>
        )}
        {startingPoint && (
          <Stack spacing={1}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {startingPoint && (
                <Typography>Starting Point: {startingPoint}</Typography>
              )}
              {loadingSampleMediaURL && <CircularProgress size={24} />}
              <CustomButton
                onClick={handleSetInitialImageClick}
                disabled={!canUpdateStartingPoint}
              >
                Update initial image
              </CustomButton>
            </Box>
            <Box>
              {sampleMediaURL && !loadingSampleMediaURL && (
                <img src={sampleMediaURL} style={{ maxHeight: 250 }} />
              )}
            </Box>
          </Stack>
        )}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "left" }}>
        <FormControl>
          <InputLabel id="my-select-label">Similarity index</InputLabel>
          <Select
            labelId="demo-simple-select-label"
            id="demo-simple-select"
            value={brainRunValue}
            label="Similarity index"
            onChange={handleBrainRunChange}
            size="small"
            sx={{ minWidth: 100 }}
          >
            {validBrainRuns.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Stack direction="column" spacing={2} sx={{ pt: 2 }}>
        {conceptSliders.map((slider, index) => (
          <Stack key={index} direction="row" spacing={3} alignItems="center">
            <TextField
              id={`text-${index}`}
              label={`Concept ${index + 1}`}
              variant="outlined"
              value={slider.text}
              onChange={(e) => handleTextChange(index, e.target.value)}
              size="small"
            />
            <CustomSlider
              sliderColor="red"
              min={0}
              max={1}
              value={slider.value}
              step={0.01}
              track={false}
              marks={conceptMarks}
              valueLabelDisplay="auto"
              onChange={(e, value) => handleConceptSlidersChange(index, value)}
            />
          </Stack>
        ))}
      </Stack>
      <Stack
        direction="row"
        sx={{ mt: 6, mb: 4, alignItems: "center" }}
        spacing={3}
      >
        <Typography id="input-slider">Scale</Typography>
        <CustomSlider
          sliderColor="gray" // or "gray"
          min={0}
          max={100}
          value={scaleSlider}
          step={0.01}
          track={false}
          marks={rangeMarks}
          valueLabelDisplay="auto"
          onChange={handleScaleSliderChange}
        />
      </Stack>
      <Typography
        variant="body2"
        sx={{ display: "flex", justifyContent: "center", marginBottom: 2 }}
      >
        Set the scale of the text concepts relative to the initial image. A
        value of 0 for this scale means that the text concepts will not factor
        into the similarity calculation. The appropriate value for this scale is
        dependent on the dataset and the text concepts you have chosen.
      </Typography>
      <ErrorView details={operatorExecutor?.error || traverseError} />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          marginTop: "20px",
          alignItems: "center",
        }}
      >
        {operatorExecutor.isExecuting && (
          <CircularProgress size={24} sx={{ mr: 2 }} />
        )}
        <Box title={startingPoint ? undefined : "Please set the initial image"}>
          <CustomButton
            onClick={() => traverse(traverseData)}
            disabled={operatorExecutor.isExecuting}
          >
            Traverse!
          </CustomButton>
        </Box>
      </Box>
    </Box>
  );
}

const TraversalIcon = ({ size = 41, style = {} }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      width={size}
      height={size}
      viewBox="-2 -7 32 40"
      x="0px"
      y="0px"
    >
      <g data-name="MESH TOOL">
        <path
          fill="white"
          d="M29,2H3A1,1,0,0,0,2,3V29a1,1,0,0,0,1,1H29a1,1,0,0,0,1-1V3A1,1,0,0,0,29,2ZM14.34,28A26.84,26.84,0,0,1,12,21.37a7.35,7.35,0,0,1,3.64.29,9.84,9.84,0,0,0,4.49.53,28,28,0,0,0,2,5.81Zm2-8.19a9.29,9.29,0,0,0-4.62-.43,7.38,7.38,0,0,1,.44-3,9.63,9.63,0,0,0,.36-5.07,6.84,6.84,0,0,1,3.07.36,10.26,10.26,0,0,0,5,.46,7.22,7.22,0,0,1-.31,3.5,9.91,9.91,0,0,0-.52,4.59A7.76,7.76,0,0,1,16.37,19.81ZM4,14.3a26,26,0,0,1,6.58-2.68,7.67,7.67,0,0,1-.25,4,9.56,9.56,0,0,0-.55,4.12A27.45,27.45,0,0,0,4,22ZM17.7,4a26.48,26.48,0,0,1,2.58,6.18,8.15,8.15,0,0,1-3.9-.37,9,9,0,0,0-4.25-.47A28.16,28.16,0,0,0,10,4Zm4.5,12.37a9.28,9.28,0,0,0,.43-4.59A28.61,28.61,0,0,0,28,9.88v7.77a27.55,27.55,0,0,1-6.21,2.27A7.85,7.85,0,0,1,22.19,16.37ZM28,7.66a28.13,28.13,0,0,1-5.74,2.17A27.44,27.44,0,0,0,20,4h8ZM7.7,4a27,27,0,0,1,2.44,5.67A27,27,0,0,0,4,12V4ZM4,24.3a26.65,26.65,0,0,1,6-2.54A27.42,27.42,0,0,0,12.12,28H4ZM24.34,28a27.63,27.63,0,0,1-2.25-6.1,27.88,27.88,0,0,0,5.9-2V28Z"
        />
      </g>
    </svg>
  );
};

registerComponent({
  name: "TraversalPanel",
  label: "Concept Traversal",
  component: TraversalPanel,
  type: PluginComponentType.Panel,
  activator: traversalActivator,
  Icon: () => <TraversalIcon size={"1rem"} style={{ marginRight: "0.5rem" }} />,
});

function getValidBrainRuns() {
  const dataset = useRecoilValue(fos.dataset);
  const brainMethods = dataset.brainMethods;
  const validBrainRuns = [];
  for (let i = 0; i < brainMethods.length; i++) {
    const brConfig = brainMethods[i].config;
    if (brConfig.cls.includes("Similarity") && brConfig.supportsPrompts) {
      validBrainRuns.push(brainMethods[i].key);
    }
  }
  return validBrainRuns;
}

function traversalActivator() {
  const dataset = useRecoilValue(fos.dataset);
  const brainMethods = dataset.brainMethods;
  for (let i = 0; i < brainMethods.length; i++) {
    const brConfig = brainMethods[i].config;
    if (brConfig.cls.includes("Similarity") && brConfig.supportsPrompts) {
      return true;
    }
  }
  return false;
}

type CustomSliderPropsType = SliderProps & {
  sliderColor: string;
};

function ErrorView(props) {
  const { title, details } = props;

  if (!title && !details) return null;

  return (
    <Alert severity="error" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
      {title && <AlertTitle>{title}</AlertTitle>}
      {details}
    </Alert>
  );
}
